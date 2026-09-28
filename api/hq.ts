// /api/hq - server side of BarkFind HQ (public/hq.html).
// Flow: browser sends the user's Supabase access token + { op, args }. We run the
// shared admin gate, then call one fixed operation. The browser never sends SQL:
// every query below is a constant with bound parameters. All the logic lives in
// the Supabase functions hq_snapshot(), hq_queue() and hq_action(); this file
// only calls them, reads Resend's metrics and runs the Claude features.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { requireAdmin } from './_lib/admin-auth.js';

const DB_URL = process.env.SUPABASE_DB_URL!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// The model comes from public.app_config (key claude_model_fast), shared with the
// edge functions, so switching models is one SQL update. Read only. Falls back to
// the same model as /api/admin-ai if the read fails or returns nothing usable.
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 800;

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });

// Must match the whitelist inside public.hq_action().
const ACTIONS = new Set([
  'approve_review', 'reject_review', 'reply_ticket', 'set_ticket_status', 'note_ticket',
  'user_report', 'location_report', 'outreach_save', 'outreach_log', 'outreach_delete',
]);

// Anthropic list prices, USD per million tokens [input, output]. Checked by Josh
// against Anthropic's model page on 28 September 2026. Keyed by model ID without
// any date suffix. No prompt caching is used, so input and output are the only
// token classes billed. A model missing here is refused rather than guessed at.
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-4-5': [1, 5],
};
function priceFor(model: string) {
  return PRICES[model.replace(/-\d{8}$/, '')] || null;
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function one(sql: string, params: unknown[] = []) {
  const r = await pool.query(sql, params);
  return r.rows[0];
}
async function claudeModel() {
  try {
    const row = await one("select value from public.app_config where key = 'claude_model_fast'");
    const v = typeof row?.value === 'string' ? row.value.trim() : '';
    if (/^[a-z0-9.-]{1,80}$/.test(v)) return v;
  } catch (e: any) {
    console.error('hq app_config read failed', e?.message);
  }
  return FALLBACK_MODEL;
}

const snapshot = async () => (await one('select public.hq_snapshot() as s')).s;
const queue = async () => (await one('select public.hq_queue() as q')).q;

async function history() {
  const r = await pool.query(
    "select taken_at::date as d, (snapshot->'users'->>'real_total')::int as real from public.hq_snapshots where taken_at > now()-interval '60 days' order by taken_at",
  );
  return r.rows;
}

// Resend account-level metrics: GET /emails/metrics (last 30 days, totals only).
async function emailMetrics() {
  if (!RESEND_API_KEY) throw new HttpError(503, 'Resend is not configured on the server.');
  const end = new Date(), start = new Date(Date.now() - 29 * 864e5);
  const qs = new URLSearchParams({
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString(),
    granularity: 'monthly',
    metrics: 'sent,delivered,bounced,bounced_permanent,complained,unsubscribed,delivery_rate,bounce_rate',
  });
  const r = await fetch('https://api.resend.com/emails/metrics?' + qs, {
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY },
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j || !j.totals) {
    console.error('hq email_metrics', r.status, JSON.stringify(j).slice(0, 300));
    throw new HttpError(502, r.status === 401 || r.status === 403
      ? 'Resend refused the request. The API key may not have access to metrics.'
      : 'Resend did not answer. Try Refresh in a minute.');
  }
  return j.totals;
}

async function claude(operation: string, prompt: string, userId: string) {
  if (!ANTHROPIC_API_KEY) throw new HttpError(503, 'Claude is not configured on the server.');
  const model = await claudeModel();
  const price = priceFor(model);
  if (!price) throw new HttpError(500, 'The configured Claude model has no unit price set, so the call was not made.');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
  });
  const msg: any = await r.json().catch(() => null);
  if (r.status === 429) throw new HttpError(429, 'Too many questions in a short time. Try again in a minute.');
  if (!r.ok || !msg || !msg.usage) {
    console.error('hq anthropic', r.status, JSON.stringify(msg).slice(0, 300));
    throw new HttpError(502, 'No answer came back. Try again.');
  }

  // Meter the call so it shows in HQ's Anthropic cost figures.
  const inTok = Number(msg.usage.input_tokens) || 0, outTok = Number(msg.usage.output_tokens) || 0;
  const cost = (inTok * price[0] + outTok * price[1]) / 1e6;
  let metered = true;
  try {
    await pool.query(
      "insert into public.api_usage (provider, operation, units, cost_usd, meta, user_id) values ('anthropic', $1, 1, $2, $3::jsonb, $4)",
      [operation, cost.toFixed(6), JSON.stringify({ model: msg.model, input_tokens: inTok, output_tokens: outTok }), userId],
    );
  } catch (e: any) {
    metered = false;
    console.error('hq api_usage insert failed', e?.message);
  }

  if (msg.stop_reason === 'refusal') throw new HttpError(502, 'No answer came back. Try again.');
  const text = (msg.content || []).map((b: any) => (b.type === 'text' ? b.text : '')).join('').trim();
  if (!text) throw new HttpError(502, 'No answer came back. Try again.');
  return { text, truncated: msg.stop_reason === 'max_tokens', metered };
}

// ---------- prompts (wording copied unchanged from the reference page) ----------

function askPrompt(ctx: unknown, q: string) {
  return "You are Ralphy, Josh's spaniel, working as the operations assistant inside BarkFind HQ. BarkFind is a solo-founded UK iOS app for finding places that are genuinely good with dogs; its in-app guide is Mylo, Josh's Vizsla, so never call yourself Mylo. Speak in the first person as Ralphy: warm, quick and to the point, like a sharp colleague who happens to be a spaniel. At most one light touch of character per answer, never a pun, never barking noises. Answers may be read aloud, so write short sentences that sound natural spoken, lead with the answer, avoid tables and long lists, and say numbers plainly. Launch is Tuesday 13 October 2026 on the App Store, build 12 approved and held. Use only the live data below and say plainly when it does not cover something (App Store reviews, crash rates, Starling bank balance and Lovable are not in this snapshot). RevenueCat revenue totals include sandbox test purchases, so never present them as real revenue. Google spend comes from a view that already applies free allowances. UK English, no em dashes, no exclamation marks, no emoji. If asked to draft a customer reply, write it plainly in Josh's voice and sign it Josh, not Ralphy.\n\nLIVE DATA (JSON):\n" + JSON.stringify(ctx) + "\n\nJOSH ASKS: " + q;
}

function ticketPrompt(t: any) {
  return "Draft a reply to this BarkFind customer support ticket. BarkFind is a UK iOS app for finding places that are genuinely good with dogs, built by one person, Josh. Write only the body: no greeting line and no sign-off, because the email adds 'Hi [name],' and 'Josh, BarkFind' automatically. Plain, warm, specific, short. UK English, no em dashes, no exclamation marks, no emoji, nothing that sounds AI-written. Facts you can rely on: monthly is £5.99, annual £39.99, 14-day free trial through Apple; founding members get their first year for £19.99; cancelling is done in iPhone Settings, Apple ID, Subscriptions; refunds are handled by Apple at reportaproblem.apple.com; if a subscription looks missing after switching accounts, Restore Purchases in the app usually fixes it; saved spots and your own reviews stay free if a subscription lapses. If you do not know something, say Josh will look into it rather than inventing it.\n\nTICKET\nSubject: " + (t.subject || "") + "\nCategory: " + (t.category || "") + "\nMessage:\n" + (t.message || "") + "\n\nEARLIER REPLIES\n" + ((t.replies || []).map(function (x: any) { return x.body }).join("\n---\n") || "none");
}

function outreachPrompt(o: any) {
  return "Draft a short message from Josh, the solo founder of BarkFind (a UK iOS app for finding places that are genuinely good with dogs, built around his reactive Vizsla, Mylo; launches on the App Store on 13 October 2026), to this contact. Use the next action as the purpose of the message. Write it so it reads as Josh wrote it himself: plain, warm, specific, short, no hype. UK English, no em dashes, no exclamation marks, no rhetorical questions, no dog puns, no emoji. For a creator, treat them as an owner with an audience rather than as an influencer. For a venue, lead with something true and specific about them. For press, lead with the local story. Sign off 'Josh'. If it is an email, give a subject line first.\n\nCONTACT (JSON):\n" + JSON.stringify({ name: o.name, org: o.org, type: o.kind, status: o.status, handle: o.handle, next_action: o.next_action, owed: o.owed, notes: o.notes, history: (o.log || []).slice(0, 5) });
}

function idArg(args: any) {
  const id = args && args.id;
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id).length > 64) throw new HttpError(400, 'A record id is needed.');
  return String(id);
}

// ---------- handler ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try {
    const gate = await requireAdmin(req, pool);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.status === 401 ? 'Not signed in.' : 'Not authorised.' });

    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const op = body.op;
    const args = (body.args && typeof body.args === 'object') ? body.args : {};

    switch (op) {
      case 'snapshot':
        return res.status(200).json({ data: await snapshot() });
      case 'queue':
        return res.status(200).json({ data: await queue() });
      case 'history':
        return res.status(200).json({ data: await history() });
      case 'email_metrics':
        return res.status(200).json({ data: await emailMetrics() });

      case 'action': {
        const action = args.action;
        if (typeof action !== 'string' || !ACTIONS.has(action)) return res.status(400).json({ error: 'Not an allowed action.' });
        const a = (args.args && typeof args.args === 'object' && !Array.isArray(args.args)) ? args.args : null;
        if (!a) return res.status(400).json({ error: 'Action details are missing.' });
        const row = await one('select public.hq_action($1, $2::jsonb) as r', [action, JSON.stringify(a)]);
        return res.status(200).json({ data: row.r });
      }

      case 'ask': {
        const q = typeof args.question === 'string' ? args.question.trim() : '';
        if (!q) return res.status(400).json({ error: 'Type a question first.' });
        if (q.length > 1000) return res.status(400).json({ error: 'That question is too long.' });
        const snap = await snapshot();
        let email: unknown = null;
        try { email = await emailMetrics(); } catch { email = null; }
        return res.status(200).json(await claude('hq_ask', askPrompt({ snapshot: snap, email_30d: email }, q), gate.userId));
      }

      case 'draft_ticket': {
        const id = idArg(args);
        const t = ((await queue())?.tickets || []).find((x: any) => String(x.id) === id);
        if (!t) return res.status(404).json({ error: 'That ticket is no longer open.' });
        return res.status(200).json(await claude('hq_draft_ticket', ticketPrompt(t), gate.userId));
      }

      case 'draft_outreach': {
        const id = idArg(args);
        const o = ((await queue())?.outreach || []).find((x: any) => String(x.id) === id);
        if (!o) return res.status(404).json({ error: 'That person is no longer in the list.' });
        return res.status(200).json(await claude('hq_draft_outreach', outreachPrompt(o), gate.userId));
      }

      default:
        return res.status(400).json({ error: 'Unknown operation.' });
    }
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('hq', e?.message || e);
    return res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  }
}
