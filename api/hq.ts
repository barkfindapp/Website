// /api/hq - server side of BarkFind HQ (public/hq.html).
// Flow: browser sends the user's Supabase access token + { op, args }. We run the
// shared admin gate, require a second sign-in step (aal2), then call one op from
// the OPS whitelist. Each op validates its own args; anything else is a 400. The
// browser never sends SQL: every query is a constant with bound parameters, and
// table names come only from fixed maps in this file. Every write runs in one
// transaction with its admin_audit row (see _lib/hq-core.ts).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool, type PoolClient } from 'pg';
import { requireStaff, type Perm } from './_lib/hq-staff.js';
import { actOps, type Op, type Ctx } from './_lib/hq-act.js';
import { teamOps } from './_lib/hq-team.js';
import { flagOps } from './_lib/hq-flags.js';
import { inboxOps } from './_lib/hq-inbox.js';
import { contentOps } from './_lib/hq-content.js';
import { announceOps } from './_lib/hq-announce.js';
import { placeOps } from './_lib/hq-places.js';
import { usdToGbp, type Fx } from './_lib/hq-fx.js';
import { rewardOps } from './_lib/hq-rewards.js';
import { insightOps } from './_lib/hq-insights.js';
import { auditOps } from './_lib/hq-audit.js';
import { trashOps } from './_lib/hq-trash.js';
import { HttpError, bad, obj, only, uuid, str, oneOf, date, bool, scrubEmails, writeTx, toTrash } from './_lib/hq-core.js';

const DB_URL = process.env.SUPABASE_DB_URL!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Reading metrics needs a full-access Resend key; the sending key is send-only. Used for the
// metrics call only, on the server, and never sent to the browser.
const RESEND_METRICS_KEY = process.env.RESEND_METRICS_KEY || RESEND_API_KEY;
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
type ActionSpec = { perm: Perm; table: string; idKey: string; label: string; args: (a: Record<string, unknown>) => Record<string, unknown> };
const ACTIONS: Record<string, ActionSpec> = {
  approve_review: { perm: 'reviews', table: 'reviews', idKey: 'id', label: 'Approved review', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  reject_review: { perm: 'reviews', table: 'reviews', idKey: 'id', label: 'Rejected review', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  reply_ticket: {
    perm: 'support_reply', table: 'support_tickets', idKey: 'ticket_id', label: 'Replied to ticket',
    args: (a) => (only(a, ['ticket_id', 'body', 'resolve']), { ticket_id: uuid(a.ticket_id), body: str(a.body, 10000, { min: 1 }), resolve: bool(a.resolve, { optional: true }) }),
  },
  set_ticket_status: {
    perm: 'support_reply', table: 'support_tickets', idKey: 'ticket_id', label: 'Changed ticket status',
    args: (a) => (only(a, ['ticket_id', 'status']), { ticket_id: uuid(a.ticket_id), status: oneOf(a.status, ['open', 'in_progress', 'resolved']) }),
  },
  note_ticket: {
    perm: 'support_reply', table: 'support_tickets', idKey: 'ticket_id', label: 'Added ticket note',
    args: (a) => (only(a, ['ticket_id', 'body']), { ticket_id: uuid(a.ticket_id), body: str(a.body, 5000, { min: 1 }) }),
  },
  user_report: {
    perm: 'reports', table: 'user_reports', idKey: 'id', label: 'Handled user report',
    args: (a) => (only(a, ['id', 'status']), { id: uuid(a.id), status: oneOf(a.status, ['actioned', 'dismissed']) }),
  },
  location_report: {
    perm: 'reports', table: 'location_reports', idKey: 'id', label: 'Handled place report',
    args: (a) => (only(a, ['id', 'status']), { id: uuid(a.id), status: oneOf(a.status, ['actioned', 'dismissed']) }),
  },
  outreach_save: {
    perm: 'outreach', table: 'hq_outreach', idKey: 'id', label: 'Saved outreach contact',
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
    perm: 'outreach', table: 'hq_outreach', idKey: 'id', label: 'Logged outreach contact',
    args: (a) => {
      only(a, ['id', 'note', 'status', 'next_follow_up']);
      const o: Record<string, unknown> = { id: uuid(a.id), note: str(a.note, 2000, { min: 1 }), next_follow_up: date(a.next_follow_up, { optional: true }) };
      const st = oneOf(a.status, OUT_STATUSES, { optional: true });
      if (st) o.status = st;
      return o;
    },
  },
  outreach_delete: { perm: 'outreach', table: 'hq_outreach', idKey: 'id', label: 'Removed outreach contact', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  renewal_done: { perm: 'renewals', table: 'hq_renewals', idKey: 'id', label: 'Marked renewal done', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  renewal_save: {
    perm: 'renewals', table: 'hq_renewals', idKey: 'id', label: 'Saved renewal date',
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
  if (!RESEND_METRICS_KEY) throw new HttpError(503, 'Resend is not configured on the server.');
  const end = new Date(), start = new Date(Date.now() - 29 * 864e5);
  const qs = new URLSearchParams({
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString(),
    granularity: 'monthly',
    metrics: 'sent,delivered,bounced,bounced_permanent,complained,unsubscribed,delivery_rate,bounce_rate',
  });
  let r: Response;
  try {
    r = await fetch('https://api.resend.com/emails/metrics?' + qs, { headers: { Authorization: 'Bearer ' + RESEND_METRICS_KEY } });
  } catch {
    throw new HttpError(502, 'Resend did not answer (no response). Try Refresh in a minute.');
  }
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j || !j.totals) {
    console.error('hq email_metrics', r.status, JSON.stringify(j).slice(0, 300));
    // Show the status code, and Resend's own error name (never the key), so the cause is clear.
    const which = process.env.RESEND_METRICS_KEY ? 'RESEND_METRICS_KEY' : 'RESEND_API_KEY (RESEND_METRICS_KEY is not set)';
    const name = j && typeof j.name === 'string' ? ', ' + j.name.replace(/[^a-z_]/gi, '').slice(0, 40) : '';
    throw new HttpError(502, r.status === 401 || r.status === 403
      ? `Resend refused the request (status ${r.status}${name}) using ${which}. The key may not have access to metrics.`
      : r.ok ? `Resend answered (status ${r.status}) without totals. Try Refresh in a minute.`
      : `Resend did not answer (status ${r.status}${name}). Try Refresh in a minute.`);
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

// ---------- prompts ----------
// Brand voice for anything sent as Josh: one person, first person singular, UK English,
// no em or en dashes, no exclamation marks. house() below also cleans dashes and
// exclamation marks out of drafts, in case the model slips.
const VOICE = "BarkFind is one person, Josh, so write in the first person singular as Josh (I, me, my) and never use we, us, our, the team or the BarkFind team. UK English spelling. No em dashes or en dashes (use a comma, a colon or a short hyphen), no exclamation marks, no emoji, nothing that sounds AI-written.";

// Swaps em and en dashes for a comma or hyphen, and exclamation marks for full stops.
function house(text: string) {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
    .replace(/\s+[\u2013\u2014]\s+/g, ', ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/!+/g, '.')
    .replace(/,\s*([.,])/g, '$1');
}
const voiced = async (p: Promise<{ text: string; truncated: boolean; metered: boolean }>) => { const r = await p; return { ...r, text: house(r.text) }; };

// RevenueCat's stored revenue totals add up every subscription, sandbox included. HQ shows and
// passes on production revenue only: metrics.revenue_usd_production when revenuecat-sync
// provides it, otherwise nothing.
function productionRevenue(snap: any) {
  const m = snap?.subscriptions?.revenuecat?.metrics;
  if (!m) return snap;
  const { revenue_usd, revenue_usd_production, ...rest } = m;
  const metrics = { ...rest, revenue_usd: revenue_usd_production || null, revenue_note: revenue_usd_production ? 'production only' : 'not available: the stored totals include sandbox test purchases' };
  return { ...snap, subscriptions: { ...snap.subscriptions, revenuecat: { ...snap.subscriptions.revenuecat, metrics } } };
}

function askPrompt(ctx: unknown, q: string) {
  return "You are Ralphy, Josh's spaniel, working as the operations assistant inside BarkFind HQ. BarkFind is a solo-founded UK iOS app for finding places that are genuinely good with dogs; its in-app guide is Mylo, Josh's Vizsla, so never call yourself Mylo. Speak in the first person as Ralphy: warm, quick and to the point, like a sharp colleague who happens to be a spaniel. At most one light touch of character per answer, never a pun, never barking noises. Answers may be read aloud, so write short sentences that sound natural spoken, lead with the answer, avoid tables and long lists, and say numbers plainly. Launch is Tuesday 13 October 2026 on the App Store, build 12 approved and held. Use only the live data below and say plainly when it does not cover something (App Store reviews, crash rates, Starling bank balance and Lovable are not in this snapshot). Revenue from RevenueCat is production only; if it is missing, say real revenue is not available yet rather than guessing. Money in the data is in US dollars (fields ending usd), but Josh runs a UK business: always answer in pounds, converting at the rate in fx (pounds per dollar, with its date), to the nearest penny under 1,000 pounds and the nearest pound above. Do not mention dollars unless asked. If fx is missing, say the figures are in US dollars. Google spend comes from a view that already applies free allowances. UK English, no em dashes or en dashes, no exclamation marks, no emoji. If asked to draft a customer reply, write it plainly in Josh's voice, in the first person singular, and sign it Josh, not Ralphy and never 'the team'.\n\nLIVE DATA (JSON):\n" + JSON.stringify(ctx) + "\n\nJOSH ASKS: " + q;
}

function ticketPrompt(t: any) {
  return "Draft a reply to this BarkFind customer support ticket. BarkFind is a UK iOS app for finding places that are genuinely good with dogs, built by one person, Josh. Write only the body: no greeting line and no sign-off, because the email adds 'Hi [name],' and signs it 'Josh, BarkFind' automatically. Plain, warm, specific, short. " + VOICE + " Facts you can rely on: monthly is £5.99, annual £39.99, 14-day free trial through Apple; founding members get their first year for £19.99; cancelling is done in iPhone Settings, Apple ID, Subscriptions; refunds are handled by Apple at reportaproblem.apple.com; if a subscription looks missing after switching accounts, Restore Purchases in the app usually fixes it; saved spots and your own reviews stay free if a subscription lapses. If you do not know something, say you will look into it rather than inventing it.\n\nTICKET\nSubject: " + (t.subject || "") + "\nCategory: " + (t.category || "") + "\nMessage:\n" + (t.message || "") + "\n\nEARLIER REPLIES\n" + ((t.replies || []).map(function (x: any) { return x.body }).join("\n---\n") || "none");
}

function outreachPrompt(o: any) {
  return "Draft a short message from Josh, the solo founder of BarkFind (a UK iOS app for finding places that are genuinely good with dogs, built around his reactive Vizsla, Mylo; launches on the App Store on 13 October 2026), to this contact. Use the next action as the purpose of the message. Write it so it reads as Josh wrote it himself: plain, warm, specific, short, no hype. " + VOICE + " No rhetorical questions, no dog puns. For a creator, treat them as an owner with an audience rather than as an influencer. For a venue, lead with something true and specific about them. For press, lead with the local story. Sign off 'Josh' on its own line, never 'the team'. If it is an email, give a subject line first.\n\nCONTACT (JSON):\n" + JSON.stringify({ name: o.name, org: o.org, type: o.kind, status: o.status, handle: o.handle, next_action: o.next_action, owed: o.owed, notes: o.notes, history: (o.log || []).slice(0, 5) });
}

// Reads one row as JSON from a table named in ACTIONS (never from the request).
async function rowOf(c: PoolClient, table: string, id: string) {
  const r = await c.query(`select to_jsonb(t) as r from public.${table} t where t.id = $1`, [id]);
  return r.rows[0]?.r ?? null;
}

// Runs one hq_action inside a write transaction: rate limit, row before and after,
// hq_trash copy for a delete, and the audit row hq_action writes gets the signed-in
// user, a short human line and the before/after.
async function runAction(ctx: Ctx, action: string, rawArgs: unknown) {
  const spec = ACTIONS[action];
  if (!spec) throw bad();
  if (!ctx.staff.perms.has(spec.perm)) throw new HttpError(403, 'You do not have access to this');
  const userId = ctx.staff.userId;
  const a = spec.args(obj(rawArgs));
  const id = (a[spec.idKey] as string | undefined) || null;
  return writeTx(pool, userId, async (c) => {
    const before = id ? await rowOf(c, spec.table, id) : null;
    if (id && !before) throw new HttpError(404, 'That record no longer exists.');
    // A child-safety escalation can only be approved or rejected with the safety permission.
    if (spec.table === 'reviews' && before && JSON.stringify(before.ai_flags || []).includes('csae_escalate') && !ctx.staff.perms.has('safety')) {
      throw new HttpError(403, 'You do not have access to this');
    }
    const r = (await c.query('select public.hq_action($1, $2::jsonb) as r', [action, JSON.stringify(a)])).rows[0].r;
    // hq_action sets status and handled_at on a user report; record who handled it too.
    if (action === 'user_report' && id && r && r.ok) await c.query('update public.user_reports set handled_by = $2 where id = $1', [id, userId]);
    const newId = id || (r && typeof r.id === 'string' ? r.id : null);
    const after = newId ? await rowOf(c, spec.table, newId) : null;
    if (action === 'outreach_delete' && id && before) await toTrash(c, userId, spec.table, id, before);
    // hq_action inserted its own audit row in this transaction (same now()); complete it. Its entity
    // is the first word of the action name ("set", "reply"), so set the real table name here.
    await c.query(
      "update public.admin_audit set actor_user_id = $1, detail = $2, before = $3::jsonb, after = $4::jsonb, entity = $5 where actor = 'hq' and actor_user_id is null and created_at = now()",
      [userId, spec.label, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), spec.table],
    );
    return r;
  });
}

// The /hq address this request came from, so invite links come back to the same site
// (production or a preview). Only barkfind.com and this project's Vercel previews are
// accepted; anything else falls back to production.
function hqUrlFor(req: VercelRequest): string {
  const raw = String(req.headers.origin || '') || ('https://' + String(req.headers['x-forwarded-host'] || req.headers.host || ''));
  let host = '';
  try { const u = new URL(raw); host = u.protocol === 'https:' ? u.hostname.toLowerCase() : ''; } catch { host = ''; }
  const ok = host === 'www.barkfind.com' || host === 'hq.barkfind.com' || /^barkfind-website-v1-[a-z0-9-]+-bark-find\.vercel\.app$/.test(host);
  return ok ? `https://${host}/hq` : 'https://www.barkfind.com/hq';
}

function tokenAal(req: VercelRequest): string | null {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch { return null; }
}

// ---------- ops whitelist: every op names the one permission it needs ----------
const has = (ctx: Ctx, p: Perm) => ctx.staff.perms.has(p);
const noArgs = (a: Record<string, unknown>) => only(a, []);
const CSAE_FLAG = 'csae_escalate';

// Money figures are left out of the snapshot without the money permission.
function snapshotFor(ctx: Ctx, snap: any) {
  if (has(ctx, 'money') || !snap) return snap;
  const { costs, subscriptions, ...rest } = snap;
  return rest;
}
// The queue only carries the sections this person can act on; emails need users_contact.
function queueFor(ctx: Ctx, q: any) {
  if (!q) return q;
  const out: any = { alerts: q.alerts || [] };
  out.reviews = has(ctx, 'reviews') ? (q.reviews || []).filter((r: any) => has(ctx, 'safety') || !JSON.stringify(r.ai_flags || []).includes(CSAE_FLAG)) : [];
  out.tickets = has(ctx, 'support_read') ? (q.tickets || []).map((t: any) => (has(ctx, 'users_contact') ? t : { ...t, email: null })) : [];
  out.user_reports = has(ctx, 'reports') ? q.user_reports || [] : [];
  out.location_reports = has(ctx, 'reports') ? q.location_reports || [] : [];
  out.business_claims = has(ctx, 'claims') ? q.business_claims || [] : [];
  out.listing_submissions = has(ctx, 'places_edit') ? q.listing_submissions || [] : [];
  out.outreach = has(ctx, 'outreach') ? q.outreach || [] : [];
  return out;
}

const OPS: Record<string, Op | { perm: null; run: Op['run'] }> = {
  // Who am I and what can I see: any active member of staff.
  me: { perm: null, run: async (a, ctx) => (noArgs(a), { data: { id: ctx.staff.userId, name: ctx.staff.name, email: ctx.staff.email, level: ctx.staff.level, perms: [...ctx.staff.perms] } }) },

  // fx: the USD to GBP rate for display (money figures stay in dollars in the data).
  snapshot: {
    perm: 'today',
    run: async (a, ctx) => {
      noArgs(a);
      const [snap, fx] = await Promise.all([snapshot(), has(ctx, 'money') ? usdToGbp(pool) : Promise.resolve(null as Fx)]);
      const out = snapshotFor(ctx, productionRevenue(snap));
      return { data: out ? { ...out, fx } : out };
    },
  },
  queue: { perm: 'today', run: async (a, ctx) => (noArgs(a), { data: queueFor(ctx, await queue()) }) },
  history: { perm: 'today', run: async (a) => (noArgs(a), { data: await history() }) },
  email_metrics: { perm: 'today', run: async (a) => (noArgs(a), { data: await emailMetrics() }) },

  // The action's own permission is checked in runAction.
  action: {
    perm: null,
    run: async (a, ctx) => {
      only(a, ['action', 'args']);
      if (typeof a.action !== 'string' || !ACTIONS[a.action]) throw bad();
      return { data: await runAction(ctx, a.action, a.args) };
    },
  },

  // Ralphy sees snapshot totals only, with any email address removed.
  ask: {
    perm: 'ask_ralphy',
    run: async (a, ctx) => {
      only(a, ['question']);
      const q = str(a.question, 1000, { min: 1 });
      const [raw, fx] = await Promise.all([snapshot(), usdToGbp(pool)]);
      const snap = scrubEmails(productionRevenue(raw));
      let email: unknown = null;
      try { email = await emailMetrics(); } catch { email = null; }
      const rate = fx ? { gbp_per_usd: fx.rate, date: fx.date, stale: fx.stale } : null;
      return claude('hq_ask', askPrompt({ snapshot: snap, email_30d: email, fx: rate }, q), ctx.staff.userId);
    },
  },

  // Drafts send only the one ticket or contact being drafted, with email addresses removed.
  draft_ticket: {
    perm: 'support_reply',
    run: async (a, ctx) => {
      const id = uuid(only(a, ['id']).id);
      const t = (await pool.query('select subject, category, message from public.support_tickets where id = $1', [id])).rows[0];
      if (!t) throw new HttpError(404, 'That ticket no longer exists.');
      // The whole conversation, labelled, so the draft answers the customer's latest message.
      const replies = (await pool.query("select (case when direction = 'in' then 'Customer replied: ' else 'Josh replied: ' end) || body as body from public.support_responses where ticket_id = $1 and not (direction = 'out' and status = 'failed') order by created_at", [id])).rows;
      return voiced(claude('hq_draft_ticket', ticketPrompt(scrubEmails({ ...t, replies })), ctx.staff.userId));
    },
  },
  draft_outreach: {
    perm: 'outreach',
    run: async (a, ctx) => {
      const id = uuid(only(a, ['id']).id);
      const o = ((await queue())?.outreach || []).find((x: any) => String(x.id) === id);
      if (!o) throw new HttpError(404, 'That person is no longer in the list.');
      return voiced(claude('hq_draft_outreach', outreachPrompt(scrubEmails(o)), ctx.staff.userId));
    },
  },

  ...actOps(pool, { claude }),
  ...teamOps(pool),
  ...flagOps(pool),
  ...inboxOps(pool),
  ...contentOps(pool),
  ...announceOps(pool),
  ...placeOps(pool),
  ...rewardOps(pool),
  ...insightOps(pool),
  ...auditOps(pool),
  ...trashOps(pool),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try {
    // HQ access comes from hq_staff (active members only).
    const gate = await requireStaff(req, pool);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.status === 401 ? 'Not signed in.' : 'Not authorised.' });
    // Second sign-in step, checked here on the server for every op.
    if (tokenAal(req) !== 'aal2') {
      if (gate.staff.status === 'invited' && gate.staff.inviteExpired) return res.status(403).json({ error: 'This invite has expired. Ask for a new one.' });
      return res.status(401).json({ error: 'Enter your 6-digit code', code: 'mfa' });
    }
    // Accepting an invite: only once there is a password and a verified second step (aal2 here).
    if (gate.staff.status === 'invited') {
      if (gate.staff.inviteExpired) return res.status(403).json({ error: 'This invite has expired. Ask for a new one.' });
      await writeTx(pool, gate.staff.userId, async (c, audit) => {
        const before = (await c.query('select to_jsonb(s) r from public.hq_staff s where user_id = $1', [gate.staff.userId])).rows[0]?.r;
        await c.query("update public.hq_staff set status = 'active', accepted_at = now(), updated_at = now() where user_id = $1 and status = 'invited'", [gate.staff.userId]);
        const after = (await c.query('select to_jsonb(s) r from public.hq_staff s where user_id = $1', [gate.staff.userId])).rows[0]?.r;
        await audit({ action: 'team_accept', entity: 'hq_staff', entityId: gate.staff.userId, detail: 'Accepted HQ invite', before, after });
      });
      gate.staff.status = 'active';
    }

    const body = obj(req.body);
    only(body, ['op', 'args']);
    const op = typeof body.op === 'string' && Object.prototype.hasOwnProperty.call(OPS, body.op) ? OPS[body.op] : null;
    if (!op) throw bad();
    if (op.perm && !gate.staff.perms.has(op.perm)) return res.status(403).json({ error: 'You do not have access to this' });
    const args = body.args === undefined ? {} : obj(body.args);
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    return res.status(200).json(await op.run(args, { staff: gate.staff, token, hqUrl: hqUrlFor(req) }));
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json(e.code ? { error: e.message, code: e.code } : { error: e.message });
    console.error('hq', e?.message || e);
    return res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  }
}
