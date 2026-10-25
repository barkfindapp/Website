// /api/hq - server side of BarkFind HQ (public/hq.html).
// Flow: browser sends the user's Supabase access token + { op, args }. We run the
// shared admin gate, require a second sign-in step (aal2), then call one op from
// the OPS whitelist. Each op validates its own args; anything else is a 400. The
// browser never sends SQL: every query is a constant with bound parameters, and
// table names come only from fixed maps in this file. Every write runs in one
// transaction with its admin_audit row (see _lib/hq-core.ts).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool, type PoolClient } from 'pg';
import { runtimeDbUrl, POOL_OPTS } from './_lib/db-url.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireStaff, type Perm } from './_lib/hq-staff.js';
import { actOps, type Op, type Ctx } from './_lib/hq-act.js';
import { teamOps } from './_lib/hq-team.js';
import { flagOps } from './_lib/hq-flags.js';
import { inboxOps } from './_lib/hq-inbox.js';
import { contentOps } from './_lib/hq-content.js';
import { announceOps } from './_lib/hq-announce.js';
import { placeOps } from './_lib/hq-places.js';
import { creatorOps, guaranteeInfo } from './_lib/hq-creators.js';
import { usdToGbp, type Fx } from './_lib/hq-fx.js';
import { rewardOps } from './_lib/hq-rewards.js';
import { insightOps } from './_lib/hq-insights.js';
import { auditOps } from './_lib/hq-audit.js';
import { trashOps } from './_lib/hq-trash.js';
import { resetOps } from './_lib/hq-reset.js';
import { payoutOps } from './_lib/hq-payouts.js';
import { outreachOps } from './_lib/hq-outreach.js';
import { outreachSendOps } from './_lib/hq-outreach-send.js';
import { adsOps, adsWatch } from './_lib/hq-ads.js';
import { siriTokenOps } from './_lib/hq-siri-tokens.js';
import { publishOps } from './_lib/hq-publish.js';
import { restrictionOps } from './_lib/hq-restrictions.js';
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

const pool = new Pool({ connectionString: runtimeDbUrl(DB_URL), ...POOL_OPTS });

// creator-admin's setup step takes up to ~30 seconds, so the function needs longer than the
// platform default before it returns. Applies to the whole /api/hq function; it is a ceiling,
// not a wait.
export const maxDuration = 60;

// ---------- hq_action: whitelist, argument shapes and the row each one touches ----------
// Names must match the whitelist inside public.hq_action(). table and idKey say which
// row to copy into admin_audit.before/after; the table names never come from the request.
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
  renewal_done: { perm: 'renewals', table: 'hq_renewals', idKey: 'id', label: 'Marked renewal done', args: (a) => ({ id: uuid(only(a, ['id']).id) }) },
  renewal_save: {
    perm: 'renewals', table: 'hq_renewals', idKey: 'id', label: 'Saved renewal date',
    args: (a) => (only(a, ['id', 'due_date']), { id: uuid(a.id), due_date: date(a.due_date) }),
  },
};

// Anthropic list prices, USD per million tokens [input, output]. Checked by Josh
// against Anthropic's model page on 15 October 2026. Keyed by model ID without
// any date suffix. No prompt caching is used, so input and output are the only
// token classes billed. A model missing here is refused rather than guessed at.
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-4-5': [1, 5],
  'claude-haiku-5-5': [0.1, 0.5],
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

// opts.meta is merged into the api_usage row (the Siri route adds source); opts.timeoutMs aborts
// a slow answer so the caller can say so rather than hang.
async function claude(operation: string, prompt: string, userId: string, maxTokens = MAX_TOKENS, opts: { meta?: Record<string, unknown>; timeoutMs?: number } = {}) {
  if (!ANTHROPIC_API_KEY) throw new HttpError(503, 'Claude is not configured on the server.');
  const model = await claudeModel();
  const price = priceFor(model);
  if (!price) throw new HttpError(500, 'The configured Claude model has no unit price set, so the call was not made.');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // Thinking off: Haiku 5.5 thinks by default and would spend the whole token budget before
    // answering. Valid on Haiku 4.5 too, so this changes nothing before the model switch.
    body: JSON.stringify({ model, max_tokens: maxTokens, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }),
    ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
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
      [operation, cost.toFixed(6), JSON.stringify({ model: msg.model, input_tokens: inTok, output_tokens: outTok, ...(opts.meta || {}) }), userId],
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

// Ask Ralphy settings: Short (spoken summary, the default) or Detailed (a fuller written answer),
// and up to 3 earlier exchanges so follow-up questions make sense.
type AskOpts = { detailed: boolean; history: { q: string; a: string }[] };
// HQ help: docs/hq-guide.md (master copy: Josh's Claude doc "HQ guide for Megan"), read once per
// server instance and bundled with this function by vercel.json includeFiles. HTML comments in the
// file are notes, not guide text. Capped at 12,000 characters; above that the rest is left out
// and a warning logged.
const GUIDE_CAP = 12000;
let guideText: string | null = null;
function hqGuide(): string {
  if (guideText !== null) return guideText;
  try {
    let t = readFileSync(join(process.cwd(), 'docs', 'hq-guide.md'), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (t.length > GUIDE_CAP) { console.warn(`hq guide: ${t.length} characters, only the first ${GUIDE_CAP} go to Ralphy`); t = t.slice(0, GUIDE_CAP); }
    guideText = t;
  } catch (e: any) {
    console.warn('hq guide: docs/hq-guide.md could not be read', e?.message);
    guideText = '';
  }
  return guideText;
}

// Who is asking. Owners get Josh's wording exactly as before; anyone else is named by their first
// name (or "A member of staff"), with their level and a reminder that some sections are hidden.
type Asker = { owner: boolean; name: string; level: string };
function askerOf(staff: { name: string; level: string }): Asker {
  const first = String(staff.name || '').trim().split(/\s+/)[0] || '';
  const name = first && !first.includes('@') ? first : 'A member of staff';
  return { owner: staff.level === 'owner', name, level: staff.level };
}

function askPrompt(ctx: unknown, q: string, opts: AskOpts = { detailed: false, history: [] }, who: Asker = { owner: true, name: 'Josh', level: 'owner' }) {
  const guide = hqGuide();
  const guideBlock = "\n\nHQ GUIDE (how HQ works):\n" + (guide || "(No guide has been added yet.)") +
    "\n\nFor questions about how to use HQ, answer only from the HQ guide above. If the guide does not cover it, say so" + (who.owner ? "." : " and suggest asking Josh.");
  if (!who.owner) return staffAskPrompt(ctx, q, opts, who, guideBlock);
  return "You are Ralphy, Josh's spaniel, working as the operations assistant inside BarkFind HQ. BarkFind is a solo-founded UK iOS app for finding places that are genuinely good with dogs; its in-app guide is Mylo, Josh's Vizsla, so never call yourself Mylo. Speak in the first person as Ralphy: warm, quick and to the point, like a sharp colleague who happens to be a spaniel. At most one light touch of character per answer, never a pun, never barking noises. Answers may be read aloud, so write short sentences that sound natural spoken, lead with the answer and avoid tables. Always write numbers, money, dates and versions as digits and symbols (£46, 18 subscribers, 13 October, version 1.0.3), never spelled out in words; the voice reads them correctly. BarkFind launched on the UK App Store on Tuesday 13 October 2026 and is live now; the current version is 1.0.3. Talk about the app as live, never as upcoming. Use only the live data below and say plainly when it does not cover something (App Store reviews, crash rates, Starling bank balance and Lovable are not in it). The data has the summary snapshot plus the live work: work_queue (open tickets, reviews to moderate, user and place reports, claims, place suggestions, outreach due and recent alerts), recent_tickets (the last 30 days and anything still open, with the latest reply and who sent it), recent_reviews (last 14 days), pending_listing_changes, creators (status, code, redemptions, posts to review, guarantee), offer_codes (founding members and each code) and creator_payouts (this month and last). A section that is missing is one Josh's access does not cover. Be specific: name the ticket, place or person, and say what to do next. If asked about a particular ticket, review or contact, use its details from the data. Revenue from RevenueCat is production only; if it is missing, say real revenue is not available yet rather than guessing. Money in the data is in US dollars (fields ending usd), but Josh runs a UK business: always answer in pounds, converting at the rate in fx (pounds per dollar, with its date), to the nearest penny under 1,000 pounds and the nearest pound above. Do not mention dollars unless asked. If fx is missing, say the figures are in US dollars. Google spend comes from a view that already applies free allowances. Apple Ads spend comes from ads (live, already in pounds): month to date against the monthly cap, what is running per day, whether HQ has paused the campaigns, and by campaign the spend, installs, trials, paying customers and the cost of each. Give these figures in pounds, never suggest raising the cap or any campaign budget, and if ads says setup false, say Apple Ads is not connected to HQ yet. UK English, no em dashes or en dashes, no exclamation marks, no emoji. If asked to draft a customer reply, write it plainly in Josh's voice, in the first person singular, and sign it Josh, not Ralphy and never 'the team'." +
    (opts.detailed ? " Josh has asked for a detailed answer: give the full picture in short paragraphs, using a few plain bullet points where they help, up to about 350 words. If he asks for a draft, write the whole draft." : " Josh has asked for a short answer: a few spoken sentences, under about 120 words, unless he asks for a draft.") +
    guideBlock +
    "\n\nLIVE DATA (JSON):\n" + JSON.stringify(ctx) +
    (opts.history.length ? "\n\nEARLIER IN THIS CONVERSATION (oldest first, for context; answer the new question):\n" + opts.history.map((h) => "Josh: " + h.q + "\nRalphy: " + h.a).join("\n\n") : "") +
    "\n\nJOSH ASKS: " + q;
}


// The same prompt for a member of staff who is not an owner: the asker is named instead of Josh
// where the line is about who is asking; lines about Josh himself (his business, his voice in
// drafts) stay as they are.
function staffAskPrompt(ctx: unknown, q: string, opts: AskOpts, who: Asker, guideBlock: string) {
  const ownerText = askPrompt(ctx, '\u0000Q\u0000', opts, { owner: true, name: 'Josh', level: 'owner' });
  const N = who.name, poss = N === 'A member of staff' ? "this member of staff's" : N + "'s";
  let t = ownerText
    .replace("A section that is missing is one Josh's access does not cover.", 'A section that is missing is one ' + poss + ' access does not cover.')
    .replace(' Josh has asked for a detailed answer: ', ' ' + N + ' has asked for a detailed answer: ').replace('If he asks for a draft', 'If they ask for a draft')
    .replace(' Josh has asked for a short answer: ', ' ' + N + ' has asked for a short answer: ').replace('unless he asks for a draft', 'unless they ask for a draft')
    .split('\nJosh: ').join('\n' + N + ': ')
    .replace('\n\nJOSH ASKS: \u0000Q\u0000', '\n\n' + N.toUpperCase() + ' ASKS: ' + q);
  // The guide in the owner text ends ".": staff get "and suggest asking Josh."
  t = t.replace(hqGuideOwnerTail(), guideBlock);
  const who_line = '\n\nWHO IS ASKING: ' + (N === 'A member of staff' ? 'a member of staff' : N) + ', a member of BarkFind staff at ' + who.level +
    ' level, not Josh. Some HQ sections are hidden by their permissions, and the live data only includes what they can see. If they ask about something their access does not cover, say it is not available to them, and do not guess.';
  return t.replace('\n\nHQ GUIDE (how HQ works):', who_line + '\n\nHQ GUIDE (how HQ works):');
}
function hqGuideOwnerTail() {
  const guide = hqGuide();
  return "\n\nHQ GUIDE (how HQ works):\n" + (guide || "(No guide has been added yet.)") + "\n\nFor questions about how to use HQ, answer only from the HQ guide above. If the guide does not cover it, say so.";
}

function ticketPrompt(t: any) {
  return "Draft a reply to this BarkFind customer support ticket. BarkFind is a UK iOS app for finding places that are genuinely good with dogs, built by one person, Josh. Write only the body: no greeting line and no sign-off, because the email adds 'Hi [name],' and signs it 'Josh, BarkFind' automatically. Plain, warm, specific, short. " + VOICE + " Facts you can rely on: monthly is £5.99, annual £39.99, 14-day free trial through Apple; founding members get their first year for £19.99; cancelling is done in iPhone Settings, Apple ID, Subscriptions; refunds are handled by Apple at reportaproblem.apple.com; if a subscription looks missing after switching accounts, Restore Purchases in the app usually fixes it; saved spots and your own reviews stay free if a subscription lapses. If you do not know something, say you will look into it rather than inventing it. Use only the facts in the ticket and its history: never describe reviews, ratings, photos, attachments, numbers or past contact that are not in it. No placeholders in brackets; leave out anything missing. Write as Josh in the first person singular, 'I', never 'we' or 'the team'.\n\nTICKET\nSubject: " + (t.subject || "") + "\nCategory: " + (t.category || "") + "\nMessage:\n" + (t.message || "") + "\n\nEARLIER REPLIES\n" + ((t.replies || []).map(function (x: any) { return x.body }).join("\n---\n") || "none");
}

function outreachPrompt(o: any) {
  return "Draft a short message from Josh, the solo founder of BarkFind (a UK iOS app for finding places that are genuinely good with dogs, built around his reactive Vizsla, Mylo; on the UK App Store now, launched 13 October 2026), to this contact. Use the next action as the purpose of the message. Write it so it reads as Josh wrote it himself: plain, warm, specific, short, no hype. " + VOICE + " No rhetorical questions, no dog puns. For a creator, treat them as an owner with an audience rather than as an influencer. For a venue, lead with something true and specific about them from the record, or simply say why you are writing if the record has nothing. For press, lead with the local story. Sign off 'Josh' on its own line, never 'the team'. If it is an email, give a subject line first. Use only the facts in the contact record and its history: never describe reviews, ratings, photos, attachments, numbers or past contact that are not in it. No placeholders in brackets; leave out anything missing. Write as Josh in the first person singular, 'I', never 'we' or 'the team'.\n\nCONTACT (JSON):\n" + JSON.stringify({ name: o.name, org: o.org, type: o.kind, status: o.status, handle: o.handle, next_action: o.next_action, owed: o.owed, notes: o.notes, history: (o.log || []).slice(0, 5) });
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
  out.outreach = has(ctx, 'outreach_view') ? q.outreach || [] : [];
  return out;
}

async function offerCodeCounts() {
  const [codes, cfg] = await Promise.all([
    pool.query(`select code, count(*)::int as count, max(created_at) as last_at from public.offer_code_redemptions
                 where code not like 'ZZTEST%' group by code order by code`),
    pool.query("select key, value from public.app_config where key in ('founder_offer_code', 'founder_offer_cap', 'founder_offer_open')"),
  ]);
  const c: Record<string, string> = Object.fromEntries(cfg.rows.map((r) => [r.key, r.value == null ? '' : String(r.value)]));
  const code = (c.founder_offer_code || '').toUpperCase();
  const cap = Number.parseInt(c.founder_offer_cap || '', 10);
  const hit = codes.rows.find((r) => r.code === code);
  return {
    founder: { code: code || null, cap: Number.isFinite(cap) ? cap : null, open: c.founder_offer_open === 'true', count: hit ? hit.count : 0, last_at: hit ? hit.last_at : null },
    codes: codes.rows,
  };
}

// Everything Ralphy can see beyond the snapshot: the live work (the same Act queue the person
// sees, filtered by their permissions), recent tickets with their last reply, recent reviews,
// pending listing changes, outreach, creators, offer codes and payouts. Each part needs the
// same permission as its tab, is capped in size, and is left out if it fails to load.
const clip = (v: unknown, n: number) => { const t = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
async function ralphyContext(ctx: Ctx) {
  const part = async <T>(ok: boolean, f: () => Promise<T>): Promise<T | undefined> => {
    if (!ok) return undefined;
    try { return await f(); } catch (e: any) { console.error('hq ralphy context', e?.message); return undefined; }
  };
  const [work, tickets, reviews, changes, creators, offers, payouts, ads] = await Promise.all([
    part(true, async () => {
      const q: any = queueFor(ctx, await queue());
      if (!q) return q;
      return { ...q, alerts: (q.alerts || []).slice(0, 15).map((a: any) => ({ kind: a.kind, title: a.title, severity: a.severity, at: a.created_at })),
        outreach: (q.outreach || []).slice(0, 20).map((o: any) => ({ name: o.name, org: o.org, kind: o.kind, status: o.status, next_action: o.next_action,
          next_follow_up: o.next_follow_up, owed: o.owed, notes: clip(o.notes, 200), last_contact_at: o.last_contact_at })) };
    }),
    part(has(ctx, 'support_read'), async () => (await pool.query(
      `select t.subject, t.category, t.status, t.priority, t.full_name as customer, t.created_at, t.updated_at, left(t.message, 500) as message,
              (select count(*) from public.support_responses r where r.ticket_id = t.id)::int as replies,
              (select left(r.body, 300) from public.support_responses r where r.ticket_id = t.id order by r.created_at desc limit 1) as last_reply,
              (select coalesce(r.direction, 'out') from public.support_responses r where r.ticket_id = t.id order by r.created_at desc limit 1) as last_reply_from
         from public.support_tickets t where t.created_at > now() - interval '30 days' or t.status <> 'resolved'
        order by t.created_at desc limit 25`)).rows.map((t: any) => ({ ...t, last_reply_from: t.last_reply_from === 'in' ? 'customer' : t.last_reply_from ? 'Josh' : null }))),
    part(has(ctx, 'reviews'), async () => (await pool.query(
      `select l.name as place, r.paw_rating, r.status, left(r.review_text, 300) as text, r.created_at
         from public.reviews r left join public.locations l on l.id = r.location_id
        where r.created_at > now() - interval '14 days' and not coalesce(r.ai_flags, '[]'::jsonb) @> '["csae_escalate"]'::jsonb
        order by r.created_at desc limit 20`)).rows),
    part(has(ctx, 'places_edit'), async () => (await pool.query(
      `select l.name as place, c.requester_role, c.source, c.changes, left(c.message, 300) as message, c.created_at
         from public.listing_change_requests c left join public.locations l on l.id = c.location_id
        where c.status = 'pending' order by c.created_at desc limit 15`)).rows),
    part(has(ctx, 'creators'), async () => {
      const rows = (await pool.query(
        `select c.id, c.display_name, c.status, c.tier, c.offer_code, c.code_cap, c.followers, c.followers_platform,
                (select count(*) from public.offer_code_redemptions x where x.code = upper(c.offer_code))::int as redeemed,
                (select count(*) from public.creator_posts p where p.creator_id = c.id and p.status = 'submitted')::int as posts_to_review
           from public.creators c where c.status in ('applied', 'approved', 'active') order by c.status, c.display_name`)).rows;
      const g = await guaranteeInfo(pool, rows.map((r: any) => r.id));
      return rows.map(({ id, ...r }: any) => ({ ...r, guarantee_earned_month: g[id]?.guarantee_month || null }));
    }),
    part(true, () => offerCodeCounts()),
    part(has(ctx, 'money'), async () => (await pool.query(
      `select display_name, month, month_closed, payable_people, refunded_same_month, refunded_from_earlier, fee_gbp, guarantee_gbp, total_gbp, over_cap
         from public.creator_payout_months where month >= to_char((now() at time zone 'Europe/London') - interval '1 month', 'YYYY-MM') order by month desc, display_name`)).rows),
    part(has(ctx, 'money'), async () => { const w: any = await adsWatch(pool); const { events, ...rest } = w; return { ...rest, recent_events: (events || []).slice(0, 5) }; }),
  ]);
  return { work_queue: work, recent_tickets: tickets, recent_reviews: reviews, pending_listing_changes: changes, creators, offer_codes: offers, creator_payouts: payouts, ads };
}

// Ralphy's answer to one question, for the ask op and the Siri route (api/hq-siri.ts) alike: the
// same live data, filtered by the asker's permissions, and the same prompt. Siri adds a line asking
// for a short spoken answer, tags the api_usage row with source siri, and gives up after timeoutMs.
const SIRI_LINE = "This answer will be read aloud by Siri. Reply in at most three short sentences and 60 words. No lists, no headings, no markdown, no links, no emoji.";
export async function ralphyAnswer(ctx: Ctx, q: string, o: { detailed?: boolean; history?: { q: string; a: string }[]; siri?: { tokenId: string; timeoutMs: number } } = {}) {
  const [raw, fx, more] = await Promise.all([snapshot(), usdToGbp(pool), ralphyContext(ctx)]);
  const snap = scrubEmails(productionRevenue(snapshotFor(ctx, raw)));
  let email: unknown = null;
  try { email = await emailMetrics(); } catch { email = null; }
  const rate = fx ? { gbp_per_usd: fx.rate, date: fx.date, stale: fx.stale } : null;
  const detailed = !!o.detailed && !o.siri;
  let prompt = askPrompt({ snapshot: snap, email_30d: email, fx: rate, ...scrubEmails(more) }, q, { detailed, history: scrubEmails(o.history || []) }, askerOf(ctx.staff));
  if (o.siri) prompt += '\n\nHOW TO ANSWER THIS ONE: ' + SIRI_LINE;
  return claude('hq_ask', prompt, ctx.staff.userId, detailed ? 2000 : MAX_TOKENS,
    o.siri ? { meta: { source: 'siri', token_id: o.siri.tokenId }, timeoutMs: o.siri.timeoutMs } : {});
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
  // App Store offer code redemptions (written by revenuecat-webhook): the founding-member
  // card on Today and the counts on creator cards. Read only. ZZTEST codes are test rows.
  offer_code_counts: { perm: 'today', run: async (a) => (noArgs(a), { data: await offerCodeCounts() }) },

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
      only(a, ['question', 'length', 'history']);
      const q = str(a.question, 1000, { min: 1 });
      const detailed = (oneOf(a.length, ['short', 'detailed'] as const, { optional: true }) || 'short') === 'detailed';
      const history: { q: string; a: string }[] = [];
      if (a.history != null) {
        if (!Array.isArray(a.history) || a.history.length > 3) throw bad();
        for (const h of a.history) { const o = obj(h); history.push({ q: str(o.q, 1000, { min: 1 }), a: str(o.a, 4000, { optional: true }) }); }
      }
      return ralphyAnswer(ctx, q, { detailed, history });
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
  // The contact and its latest log entries, read straight from the tables (the prompt is unchanged).
  draft_outreach: {
    perm: 'outreach_edit',
    run: async (a, ctx) => {
      const id = uuid(only(a, ['id']).id);
      const o = (await pool.query(
        `select o.*, (select coalesce(jsonb_agg(jsonb_build_object('at', g.at, 'note', g.note) order by g.at desc), '[]') from public.hq_outreach_log g where g.outreach_id = o.id) as log
           from public.hq_outreach o where o.id = $1`, [id])).rows[0];
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
  ...creatorOps(pool),
  ...rewardOps(pool),
  ...insightOps(pool),
  ...auditOps(pool),
  ...trashOps(pool),
  ...resetOps(pool),
  ...payoutOps(pool),
  ...outreachOps(pool),
  ...outreachSendOps(pool),
  ...adsOps(pool),
  ...siriTokenOps(pool),
  ...publishOps(pool),
  ...restrictionOps(pool),
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
