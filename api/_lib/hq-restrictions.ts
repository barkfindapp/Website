// Act, Restrictions: review the beach dog rules the weekly sweep extracts into
// location_restrictions (status pending). An approved rule shows in the app as a chip on the
// place and feeds Mylo's verdict, so a wrong rule is worse than none: each pending rule is shown
// with its source quote and flags that point at the usual mistakes, without blocking anything.
// Reject reasons and hold notes live in the audit (no extra columns). After an approve, the
// browser asks restrictions_refresh for the affected places, five at a time; each is a forced
// mylo-summary call (admin path, x-mylo-admin = app_secrets.mylo_trigger, never sent to the
// browser), at most 5 at once and 30 seconds each. mylo-summary meters itself as mylo_verdict;
// HQ only reads that cost back. "Draft spotlight post" calls notify_content_generate exactly as
// trg_content_restriction_approved does.
import type { Pool } from 'pg';
import { HttpError, only, uuid, str, oneOf, date, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';

const MYLO_URL = 'https://kwwnwniyijeuorpbyvmn.supabase.co/functions/v1/mylo-summary';
const TYPES = ['dogs_banned', 'lead_required', 'dogs_allowed', 'hazard', 'other'] as const;
export const REASONS = ['wrong_place', 'wrong_type', 'not_a_rule', 'duplicate', 'general_advice', 'other'] as const;
const REASON_TEXT: Record<string, string> = { wrong_place: 'wrong place', wrong_type: 'wrong type', not_a_rule: 'not a rule', duplicate: 'duplicate', general_advice: 'general advice', other: 'other' };
export const REFRESH = { perCall: 5, concurrency: 5, timeoutMs: 30000 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const STOP = new Set(['the', 'and', 'for', 'with', 'from']);
const LABEL: Record<string, string> = { dogs_banned: 'no dogs', lead_required: 'dogs on lead', dogs_allowed: 'dogs allowed', hazard: 'hazard', other: 'other' };
const label = (t: unknown) => LABEL[String(t)] || String(t).replace(/_/g, ' ');

const COLS = `r.id, r.location_id, r.restriction_type, r.summary, r.area_description, r.starts_on::text as starts_on, r.ends_on::text as ends_on,
  to_char(r.starts_time, 'HH24:MI') as starts_time, to_char(r.ends_time, 'HH24:MI') as ends_time, r.applies_annually, r.authority,
  r.source_url, r.source_quote, r.status, r.relevant_to, r.extracted_at, r.created_at, r.approved_at,
  l.name as place_name, l.address as place_address, l.latitude, l.longitude`;

// ---------- flags (shown, never blocking) ----------
const words = (s: unknown) => new Set(String(s ?? '').toLowerCase().match(/[a-z0-9']+/g)?.filter((w) => w.length >= 3 && !STOP.has(w)) ?? []);
// A date "appears" in the quote if its day and month do, in any common form: "1 May", "1st May",
// "May 1", "01/05".
export function dateInQuote(iso: string | null, quote: string): boolean {
  if (!iso) return false;
  const [, m, d] = iso.split('-').map(Number);
  const q = quote.toLowerCase(), mon = MONTHS[m - 1], mon3 = mon.slice(0, 3);
  const day = `${d}(?:st|nd|rd|th)?`;
  return new RegExp(`\\b${day}\\s+(?:of\\s+)?(?:${mon}|${mon3})\\b|\\b(?:${mon}|${mon3})\\.?\\s+${day}\\b|\\b0?${d}[/.]0?${m}\\b`).test(q);
}
export function flagsFor(r: any, ctx: { sameQuotePlaces: number; approvedSameType: number }) {
  const f: string[] = [];
  const quote = String(r.source_quote ?? '');
  if (r.starts_on && r.ends_on && r.ends_on < r.starts_on) f.push('end_before_start');
  if ((r.starts_on || r.ends_on) && quote && !dateInQuote(r.starts_on, quote) && !dateInQuote(r.ends_on, quote)) f.push('dates_not_in_quote');
  if (r.restriction_type === 'lead_required' && /\b(close|under)\s+(?:\w+\s+)?control\b/i.test(quote)) f.push('close_control');
  if (ctx.sameQuotePlaces >= 3) f.push('same_quote');
  const name = words(r.place_name), other = new Set([...words(r.area_description), ...words(quote)]);
  if (name.size && ![...name].some((w) => other.has(w))) f.push('name_mismatch');
  if (ctx.approvedSameType > 0) f.push('possible_duplicate');
  return f;
}

async function rulesWithFlags(q: Pool, status: 'pending' | 'approved', limit: number) {
  const rows = (await q.query(
    `select ${COLS},
            (select count(distinct x.location_id)::int from public.location_restrictions x
              where x.authority is not distinct from r.authority and x.source_quote = r.source_quote and x.status <> 'rejected') as same_quote_places,
            (select count(*)::int from public.location_restrictions x
              where x.location_id = r.location_id and x.restriction_type = r.restriction_type and x.status = 'approved' and x.id <> r.id) as approved_same_type,
            (select jsonb_build_object('note', a.after->>'note', 'at', a.created_at, 'by', coalesce(s.display_name, s.email))
               from public.admin_audit a left join public.hq_staff s on s.user_id = a.actor_user_id
              where a.action = 'restriction_hold' and a.entity_id = r.id::text order by a.created_at desc limit 1) as last_hold
       from public.location_restrictions r join public.locations l on l.id = r.location_id
      where r.status = $1
      order by coalesce(r.authority, 'zzz'), l.name, r.created_at
      limit $2`, [status, limit])).rows;
  return rows.map((r: any) => ({ ...r, flags: status === 'pending' ? flagsFor(r, { sameQuotePlaces: r.same_quote_places, approvedSameType: r.approved_same_type }) : [] }));
}

export async function restrictionCounts(q: Pool) {
  const r = (await q.query(
    `select count(*)::int as pending, min(created_at) as oldest from public.location_restrictions where status = 'pending'`)).rows[0];
  return { pending: r.pending, oldest_at: r.oldest, oldest_days: r.oldest ? Math.floor((Date.now() - new Date(r.oldest).getTime()) / 864e5) : null };
}

// ---------- verdict refresh ----------
type Refresh = { location_id: string; place: string | null; result: 'refreshed' | 'cleared' | 'failed'; verdict?: string | null; detail?: string };
export async function refreshVerdicts(q: Pool, ids: string[], fetchFn: typeof fetch = fetch): Promise<{ results: Refresh[]; cost_usd: number }> {
  const unique = [...new Set(ids)];
  const sec = (await q.query("select value from public.app_secrets where name = 'mylo_trigger'")).rows[0]?.value;
  const names = Object.fromEntries((await q.query('select id::text as id, name from public.locations where id = any($1::uuid[])', [unique])).rows.map((r: any) => [r.id, r.name]));
  const started = new Date();
  const results: Refresh[] = [];
  const one = async (id: string): Promise<Refresh> => {
    const base = { location_id: id, place: names[id] ?? null };
    if (!sec) return { ...base, result: 'failed', detail: 'The Mylo trigger secret is not set up.' };
    try {
      const res = await fetchFn(MYLO_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-mylo-admin': sec },
        body: JSON.stringify({ location_id: id, force: true }), signal: AbortSignal.timeout(REFRESH.timeoutMs) });
      const j: any = await res.json().catch(() => ({}));
      if (!res.ok || j.error) return { ...base, result: 'failed', detail: `mylo-summary answered ${res.status}` };
      if (j.reason === 'no_dog_evidence' || j.reason === 'verdict_described_the_evidence') return { ...base, result: 'cleared', verdict: null, detail: j.reason === 'no_dog_evidence' ? 'No dog evidence, so no verdict.' : 'Nothing publishable, so no verdict.' };
      return { ...base, result: 'refreshed', verdict: j.verdict ?? null, detail: j.kept_existing ? 'The new verdict ran long, so the existing one was kept.' : undefined };
    } catch (e: any) {
      return { ...base, result: 'failed', detail: e?.name === 'TimeoutError' ? 'No answer within 30 seconds.' : 'mylo-summary did not answer.' };
    }
  };
  // At most REFRESH.concurrency calls in flight.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(REFRESH.concurrency, unique.length) }, async () => {
    while (next < unique.length) { const id = unique[next++]; results.push(await one(id)); }
  }));
  const cost = (await q.query(
    `select coalesce(sum(cost_usd), 0)::float as usd from public.api_usage where operation = 'mylo_verdict' and location_id = any($1::uuid[]) and created_at >= $2`,
    [unique, started])).rows[0].usd;
  return { results: unique.map((id) => results.find((r) => r.location_id === id)!), cost_usd: Math.round(cost * 1e6) / 1e6 };
}

// ---------- ops ----------
export function restrictionOps(pool: Pool): Record<string, Op> {
  return {
    restrictions_list: {
      perm: 'restrictions_review',
      run: async (a) => {
        only(a, ['status']);
        const status = (oneOf(a.status, ['pending', 'approved'] as const, { optional: true }) || 'pending') as 'pending' | 'approved';
        const [rows, counts] = await Promise.all([rulesWithFlags(pool, status, status === 'pending' ? 500 : 200), restrictionCounts(pool)]);
        return { data: { status, rules: rows, counts, reasons: REASONS } };
      },
    },
    restrictions_counts: { perm: 'restrictions_review', run: async (a) => { only(a, []); return { data: await restrictionCounts(pool) }; } },

    // Approve, reject or hold one rule or several (bulk is approve or reject only, one reason for all).
    restrictions_act: {
      perm: 'restrictions_review',
      run: async (a, ctx) => {
        only(a, ['action', 'ids', 'reason', 'reason_text', 'note']);
        const action = oneOf(a.action, ['approve', 'reject', 'hold'] as const);
        if (!Array.isArray(a.ids) || !a.ids.length || a.ids.length > 100) throw new HttpError(400, 'Pick at least one rule.');
        const ids = [...new Set(a.ids.map((x) => uuid(x)))];
        if (action === 'hold' && ids.length > 1) throw new HttpError(400, 'Hold one rule at a time.');
        const reason = action === 'reject' ? oneOf(a.reason, REASONS) : null;
        const reasonText = reason === 'other' ? str(a.reason_text, 200, { min: 2 }) : null;
        const note = action === 'hold' ? (str(a.note, 300, { optional: true }) || null) : null;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query(
            `select r.*, l.name as place_name from public.location_restrictions r join public.locations l on l.id = r.location_id where r.id = any($1::uuid[]) for update of r`, [ids])).rows;
          if (before.length !== ids.length) throw new HttpError(404, 'One of those rules no longer exists. Refresh and try again.');
          const notPending = before.filter((r: any) => r.status !== 'pending');
          if (notPending.length) throw new HttpError(409, `${notPending.length === 1 ? 'One rule has' : notPending.length + ' rules have'} already been reviewed. Refresh and try again.`);
          for (const b of before) {
            let after = b;
            if (action === 'approve') after = (await c.query(`update public.location_restrictions set status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() where id = $1 returning *`, [b.id, ctx.staff.userId])).rows[0];
            if (action === 'reject') after = (await c.query(`update public.location_restrictions set status = 'rejected', updated_at = now() where id = $1 returning *`, [b.id])).rows[0];
            const why = reason ? REASON_TEXT[reason] + (reasonText ? ': ' + reasonText : '') : null;
            await audit({ action: 'restriction_' + action, entity: 'location_restrictions', entityId: b.id,
              detail: `${action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'Held'} the ${label(b.restriction_type)} rule at ${b.place_name}${why ? ' (' + why + ')' : ''}${note ? ': ' + note : ''}`.slice(0, 300),
              before: b, after: action === 'hold' ? { ...b, note } : { ...after, ...(reason ? { reject_reason: reason, reject_reason_text: reasonText } : {}) } });
          }
          const places = [...new Set(before.map((b: any) => String(b.location_id)))];
          return { ok: true, message: action === 'hold' ? 'Held. It stays pending.' : `${action === 'approve' ? 'Approved' : 'Rejected'} ${ids.length} rule${ids.length === 1 ? '' : 's'}.`,
            refresh_places: action === 'approve' ? places : [] };
        });
      },
    },

    // Edit then approve: change type, dates, times, area or summary, then approve. The original
    // values go in the audit. Refuses, with a message, if the edit would duplicate an existing rule.
    restrictions_edit_approve: {
      perm: 'restrictions_review',
      run: async (a, ctx) => {
        only(a, ['id', 'restriction_type', 'summary', 'area_description', 'starts_on', 'ends_on', 'starts_time', 'ends_time']);
        const id = uuid(a.id);
        const type = oneOf(a.restriction_type, TYPES);
        const summary = str(a.summary, 500, { min: 3 });
        const area = str(a.area_description, 300, { optional: true }) || null;
        const startsOn = a.starts_on ? date(a.starts_on) : null, endsOn = a.ends_on ? date(a.ends_on) : null;
        if (!!startsOn !== !!endsOn) throw new HttpError(400, 'Give both dates, or neither.');
        const time = (v: unknown) => { if (v == null || v === '') return null; const s = String(v); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, 'Times are like 10:00 or 18:30.'); return s; };
        const startsTime = time(a.starts_time), endsTime = time(a.ends_time);
        if (!!startsTime !== !!endsTime) throw new HttpError(400, 'Give both times, or neither.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const b = (await c.query(`select r.*, l.name as place_name from public.location_restrictions r join public.locations l on l.id = r.location_id where r.id = $1 for update of r`, [id])).rows[0];
          if (!b) throw new HttpError(404, 'That rule no longer exists.');
          if (b.status !== 'pending') throw new HttpError(409, 'That rule has already been reviewed. Refresh and try again.');
          // The unique index is (location_id, source_url, restriction_type, md5(source_quote)).
          const clash = (await c.query(
            `select status from public.location_restrictions where id <> $1 and location_id = $2 and source_url = $3 and restriction_type = $4
                and md5(source_quote) is not distinct from md5($5) limit 1`, [id, b.location_id, b.source_url, type, b.source_quote])).rows[0];
          if (clash) throw new HttpError(409, `This place already has a ${label(type)} rule from the same source and quote (${clash.status}). Reject this one as a duplicate instead.`);
          let after;
          try {
            after = (await c.query(
              `update public.location_restrictions set restriction_type = $2, summary = $3, area_description = $4, starts_on = $5, ends_on = $6,
                      starts_time = $7::time, ends_time = $8::time, status = 'approved', approved_by = $9, approved_at = now(), updated_at = now()
                where id = $1 returning *`, [id, type, summary, area, startsOn, endsOn, startsTime, endsTime, ctx.staff.userId])).rows[0];
          } catch (e: any) {
            if (e?.code === '23505') throw new HttpError(409, `This place already has a ${label(type)} rule from the same source and quote. Reject this one as a duplicate instead.`);
            throw e;
          }
          await audit({ action: 'restriction_edit_approve', entity: 'location_restrictions', entityId: id,
            detail: `Edited and approved the ${label(type)} rule at ${b.place_name}`.slice(0, 300), before: b, after });
          return { ok: true, message: 'Edited and approved.', refresh_places: [String(b.location_id)] };
        });
      },
    },

    // Forced verdict refresh, at most REFRESH.perCall places per call (the browser sends them in
    // groups so no single request runs long). Only places that have an approved rule qualify.
    restrictions_refresh: {
      perm: 'restrictions_review',
      run: async (a) => {
        only(a, ['location_ids']);
        if (!Array.isArray(a.location_ids) || !a.location_ids.length || a.location_ids.length > REFRESH.perCall) throw new HttpError(400, `Send 1 to ${REFRESH.perCall} places.`);
        const ids = [...new Set(a.location_ids.map((x) => uuid(x)))];
        const ok = (await pool.query(`select distinct location_id::text as id from public.location_restrictions where location_id = any($1::uuid[]) and status = 'approved'`, [ids])).rows.map((r: any) => r.id);
        if (ok.length !== ids.length) throw new HttpError(400, 'Only places with an approved rule can be refreshed here.');
        return { data: await refreshVerdicts(pool, ids) };
      },
    },

    // Draft spotlight post: one approved rule, through notify_content_generate, exactly as the
    // trigger did. The draft appears in Content.
    restrictions_spotlight: {
      perm: 'restrictions_review',
      run: async (a, ctx) => {
        only(a, ['id']);
        const id = uuid(a.id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const r = (await c.query(`select r.id, r.status, r.restriction_type, l.name as place_name from public.location_restrictions r join public.locations l on l.id = r.location_id where r.id = $1`, [id])).rows[0];
          if (!r) throw new HttpError(404, 'That rule no longer exists.');
          if (r.status !== 'approved') throw new HttpError(409, 'Only an approved rule can have a spotlight post.');
          await c.query(`select public.notify_content_generate('restriction_spotlight', jsonb_build_object('restriction_id', $1::uuid, 'triggered_by', 'hq:restrictions'))`, [id]);
          await audit({ action: 'restriction_spotlight', entity: 'location_restrictions', entityId: id,
            detail: `Asked for a spotlight post on the ${label(r.restriction_type)} rule at ${r.place_name}`.slice(0, 300), before: null, after: { requested: true } });
          return { ok: true, message: 'Drafting. The post appears in Content, Queue, in a minute or so.' };
        });
      },
    },
  };
}
