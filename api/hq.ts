// /api/hq - server side of BarkFind HQ (public/hq.html).
// Flow: browser sends the user's Supabase access token + { op, args }. We run the
// shared admin gate, require a second sign-in step (aal2), then call one op from
// the OPS whitelist. Each op validates its own args; anything else is a 400. The
// browser never sends SQL: every query is a constant with bound parameters, and
// table names come only from fixed maps in this file. Every write runs in one
// transaction with its admin_audit row (see _lib/hq-core.ts).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool, type PoolClient } from 'pg';
import { requireAdmin } from './_lib/admin-auth.js';
import { HttpError, bad, obj, only, uuid, str, oneOf, date, bool, scrubEmails, writeTx, toTrash } from './_lib/hq-core.js';

const DB_URL = process.env.SUPABASE_DB_URL!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// The model comes from public.app_config (key claude_model_fast), shared with the
// edge functions, so switching models is one SQL update. Read only. Falls back to
// the same model as /api/admin-ai if the read fails or returns nothing usable.
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 800;

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });

// ---------- hq_action: whitelist, argument shapes and the row each one touches ----------
// Names must match the whitelist inside public.hq_action(). table and idKey say which
// row to copy into admin_audit.before/after; the table names never come from the request.
const KINDS = ['creator', 'venue', 'press', 'partner', 'other'] as const;
const OUT_STATUSES = ['to_contact', 'contacted', 'replied', 'agreed', 'live', 'declined', 'parked'] as const;
type ActionSpec = { table: string; idKey: string; label: string; args: (a: Record<string, unknown>) => Record<string, unknown> };
const ACTIONS: Record<string, ActionSpec> = {
  approve_review: { table: 'reviews', idKey: 'id', label: 'Approved review', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  reject_review: { table: 'reviews', idKey: 'id', label: 'Rejected review', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  reply_ticket: {
    table: 'support_tickets', idKey: 'ticket_id', label: 'Replied to ticket',
    args: (a) => (only(a, ['ticket_id', 'body', 'resolve']), { ticket_id: uuid(a.ticket_id), body: str(a.body, 10000, { min: 1 }), resolve: bool(a.resolve, { optional: true }) }),
  },
  set_ticket_status: {
    table: 'support_tickets', idKey: 'ticket_id', label: 'Changed ticket status',
    args: (a) => (only(a, ['ticket_id', 'status']), { ticket_id: uuid(a.ticket_id), status: oneOf(a.status, ['open', 'in_progress', 'resolved']) }),
  },
  note_ticket: {
    table: 'support_tickets', idKey: 'ticket_id', label: 'Added ticket note',
    args: (a) => (only(a, ['ticket_id', 'body']), { ticket_id: uuid(a.ticket_id), body: str(a.body, 5000, { min: 1 }) }),
  },
  user_report: {
    table: 'user_reports', idKey: 'id', label: 'Handled user report',
    args: (a) => (only(a, ['id', 'status']), { id: uuid(a.id), status: oneOf(a.status, ['actioned', 'dismissed']) }),
  },
  location_report: {
    table: 'location_reports', idKey: 'id', label: 'Handled place report',
    args: (a) => (only(a, ['id', 'status']), { id: uuid(a.id), status: oneOf(a.status, ['actioned', 'dismissed']) }),
  },
  outreach_save: {
    table: 'hq_outreach', idKey: 'id', label: 'Saved outreach contact',
    args: (a) => {
      only(a, ['id', 'name', 'org', 'kind', 'status', 'handle', 'email', 'phone', 'next_follow_up', 'next_action', 'owed', 'notes']);
      const o: Record<string, unknown> = {
        name: str(a.name, 200, { min: 1 }), org: str(a.org, 200, { optional: true }),
        kind: oneOf(a.kind, KINDS, { optional: true }) || 'creator', status: oneOf(a.status, OUT_STATUSES, { optional: true }) || 'to_contact',
        handle: str(a.handle, 200, { optional: true }), email: str(a.email, 200, { optional: true }), phone: str(a.phone, 60, { optional: true }),
        next_follow_up: date(a.next_follow_up, { optional: true }), next_action: str(a.next_action, 500, { optional: true }),
        owed: str(a.owed, 500, { optional: true }), notes: str(a.notes, 5000, { optional: true }),
      };
      if (a.id !== undefined && a.id !== '') o.id = uuid(a.id);
      return o;
    },
  },
  outreach_log: {
    table: 'hq_outreach', idKey: 'id', label: 'Logged outreach contact',
    args: (a) => {
      only(a, ['id', 'note', 'status', 'next_follow_up']);
      const o: Record<string, unknown> = { id: uuid(a.id), note: str(a.note, 2000, { min: 1 }), next_follow_up: date(a.next_follow_up, { optional: true }) };
      const st = oneOf(a.status, OUT_STATUSES, { optional: true });
      if (st) o.status = st;
      return o;
    },
  },
  outreach_delete: { table: 'hq_outreach', idKey: 'id', label: 'Removed outreach contact', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  renewal_done: { table: 'hq_renewals', idKey: 'id', label: 'Marked renewal done', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  renewal_save: {
    table: 'hq_renewals', idKey: 'id', label: 'Saved renewal date',
    args: (a) => (only(a, ['id', 'due_date']), { id: uuid(a.id), due_date: date(a.due_date) }),
  },
};

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

// Reads one row as JSON from a table named in ACTIONS (never from the request).
async function rowOf(c: PoolClient, table: string, id: string) {
  const r = await c.query(`select to_jsonb(t) as r from public.${table} t where t.id = $1`, [id]);
  return r.rows[0]?.r ?? null;
}

// Runs one hq_action inside a write transaction: rate limit, row before and after,
// hq_trash copy for a delete, and the audit row hq_action writes gets the signed-in
// user, a short human line and the before/after.
async function runAction(userId: string, action: string, rawArgs: unknown) {
  const spec = ACTIONS[action];
  if (!spec) throw bad();
  const a = spec.args(obj(rawArgs));
  const id = (a[spec.idKey] as string | undefined) || null;
  return writeTx(pool, userId, async (c) => {
    const before = id ? await rowOf(c, spec.table, id) : null;
    if (id && !before) throw new HttpError(404, 'That record no longer exists.');
    const r = (await c.query('select public.hq_action($1, $2::jsonb) as r', [action, JSON.stringify(a)])).rows[0].r;
    const newId = id || (r && typeof r.id === 'string' ? r.id : null);
    const after = newId ? await rowOf(c, spec.table, newId) : null;
    if (action === 'outreach_delete' && id && before) await toTrash(c, userId, spec.table, id, before);
    // hq_action inserted its own audit row in this transaction (same now()); complete it.
    await c.query(
      "update public.admin_audit set actor_user_id = $1, detail = $2, before = $3::jsonb, after = $4::jsonb where actor = 'hq' and actor_user_id is null and created_at = now()",
      [userId, spec.label, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)],
    );
    return r;
  });
}

// Reads the aal claim from a token requireAdmin has already verified with Supabase.
function tokenAal(req: VercelRequest): string | null {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch { return null; }
}

// ---------- ops whitelist ----------
type Ctx = { userId: string };
const noArgs = (a: Record<string, unknown>) => only(a, []);
const OPS: Record<string, (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown>> = {
  snapshot: async (a) => (noArgs(a), { data: await snapshot() }),
  queue: async (a) => (noArgs(a), { data: await queue() }),
  history: async (a) => (noArgs(a), { data: await history() }),
  email_metrics: async (a) => (noArgs(a), { data: await emailMetrics() }),

  action: async (a, ctx) => {
    only(a, ['action', 'args']);
    if (typeof a.action !== 'string' || !ACTIONS[a.action]) throw bad();
    return { data: await runAction(ctx.userId, a.action, a.args) };
  },

  // Ralphy sees snapshot totals only, with any email address removed.
  ask: async (a, ctx) => {
    only(a, ['question']);
    const q = str(a.question, 1000, { min: 1 });
    const snap = scrubEmails(await snapshot());
    let email: unknown = null;
    try { email = await emailMetrics(); } catch { email = null; }
    return claude('hq_ask', askPrompt({ snapshot: snap, email_30d: email }, q), ctx.userId);
  },

  // Drafts send only the one ticket or contact being drafted, with email addresses removed.
  draft_ticket: async (a, ctx) => {
    const id = uuid(only(a, ['id']).id);
    const t = ((await queue())?.tickets || []).find((x: any) => String(x.id) === id);
    if (!t) throw new HttpError(404, 'That ticket is no longer open.');
    return claude('hq_draft_ticket', ticketPrompt(scrubEmails(t)), ctx.userId);
  },
  draft_outreach: async (a, ctx) => {
    const id = uuid(only(a, ['id']).id);
    const o = ((await queue())?.outreach || []).find((x: any) => String(x.id) === id);
    if (!o) throw new HttpError(404, 'That person is no longer in the list.');
    return claude('hq_draft_outreach', outreachPrompt(scrubEmails(o)), ctx.userId);
  },
};

// ---------- handler ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try {
    const gate = await requireAdmin(req, pool);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.status === 401 ? 'Not signed in.' : 'Not authorised.' });
    // Second sign-in step, checked here on the server for every op.
    if (tokenAal(req) !== 'aal2') return res.status(401).json({ error: 'Enter your 6-digit code', code: 'mfa' });

    const body = obj(req.body);
    only(body, ['op', 'args']);
    const run = typeof body.op === 'string' && Object.prototype.hasOwnProperty.call(OPS, body.op) ? OPS[body.op] : null;
    if (!run) throw bad();
    const args = body.args === undefined ? {} : obj(body.args);
    return res.status(200).json(await run(args, { userId: gate.userId }));
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('hq', e?.message || e);
    return res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  }
}
