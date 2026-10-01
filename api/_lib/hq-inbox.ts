// Phase 1c Part B: one support inbox over every kind of request. Support tickets keep
// their own status, priority (severity), snoozed_until and assigned_to; every other kind
// keeps its own status and uses hq_inbox_meta for assignee, severity, snooze, waiting and
// tags. Statuses shown: Open (we owe a reply), Waiting (they owe us), Snoozed, Closed.
// Each kind is only listed for people with its permission. Emails need users_contact.
import type { Pool, PoolClient } from 'pg';
import { Resend } from 'resend';
import { HttpError, bad, only, uuid, str, oneOf, writeTx } from './hq-core.js';
import type { Op, Ctx } from './hq-act.js';
import type { Perm } from './hq-staff.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
export const KINDS = ['support_ticket', 'listing_change', 'business_claim', 'place_report', 'user_report', 'privacy_request', 'treat_claim'] as const;
type Kind = typeof KINDS[number];
const SEVERITIES = ['urgent', 'high', 'normal', 'low'] as const;
const VIEWS = ['unassigned', 'mine', 'open', 'waiting', 'snoozed', 'closed'] as const;
const PAGE = 40;
// Who can see each kind in the inbox.
const KIND_PERM: Record<Kind, Perm[]> = {
  support_ticket: ['support_read'], listing_change: ['support_read', 'places_edit'], business_claim: ['claims'],
  place_report: ['reports'], user_report: ['reports'], privacy_request: ['privacy'], treat_claim: ['support_read'],
};
const canSee = (ctx: Ctx, k: Kind) => KIND_PERM[k].some((p) => ctx.staff.perms.has(p));
const has = (ctx: Ctx, p: Perm) => ctx.staff.perms.has(p);
const LISTING_FIELDS = ['name', 'address', 'opening_hours', 'dog_policy', 'dog_policy_note', 'website', 'image_url', 'closed'] as const;
const DOG_POLICIES = ['welcome', 'restricted', 'not_allowed'] as const;

// One row per request, whatever its kind: the same columns from every table.
// Severity targets for the first reply: urgent 2h, high 8h, normal 24h, low 3 days.
const UNION = `
  select 'support_ticket'::text as kind, t.id, t.created_at, t.subject as title, t.full_name as person, t.email, t.user_id, null::uuid as location_id,
         case when t.status = 'resolved' then 'closed' when t.status = 'waiting' then 'waiting' else 'open' end as state,
         t.priority as severity, t.assigned_to, t.snoozed_until, t.tags,
         (select min(r.created_at) from public.support_responses r where r.ticket_id = t.id) as first_reply_at, t.category as detail
    from public.support_tickets t
  union all
  select 'listing_change', c.id, c.created_at, 'Change to ' || coalesce(l.name, 'a place'), c.requester_name, c.requester_email, c.requested_by, c.location_id,
         case when c.status <> 'pending' then 'closed' when m.waiting_since is not null then 'waiting' else 'open' end,
         coalesce(m.severity, 'normal'), m.assigned_to, m.snoozed_until, coalesce(m.tags, '{}'), c.decided_at, c.source
    from public.listing_change_requests c left join public.locations l on l.id = c.location_id
    left join public.hq_inbox_meta m on m.kind = 'listing_change' and m.ref_id = c.id
  union all
  select 'business_claim', b.id, b.created_at, 'Claim for ' || coalesce(l.name, 'a place'), b.claimant_name, b.claimant_email, b.user_id, b.location_id,
         case when b.status <> 'pending' then 'closed' when m.waiting_since is not null then 'waiting' else 'open' end,
         coalesce(m.severity, 'normal'), m.assigned_to, m.snoozed_until, coalesce(m.tags, '{}'), null::timestamptz, null
    from public.business_claims b left join public.locations l on l.id = b.location_id
    left join public.hq_inbox_meta m on m.kind = 'business_claim' and m.ref_id = b.id
  union all
  select 'place_report', r.id, r.created_at, coalesce(l.name, 'A place') || ': ' || r.reason, null, null, r.user_id, r.location_id,
         case when r.status <> 'open' then 'closed' when m.waiting_since is not null then 'waiting' else 'open' end,
         coalesce(m.severity, 'normal'), m.assigned_to, m.snoozed_until, coalesce(m.tags, '{}'), null::timestamptz, null
    from public.location_reports r left join public.locations l on l.id = r.location_id
    left join public.hq_inbox_meta m on m.kind = 'place_report' and m.ref_id = r.id
  union all
  select 'user_report', u.id, u.created_at, 'Report about ' || coalesce(p.full_name, 'a customer'), null, null, u.reported_user_id, null,
         case when u.status <> 'pending' then 'closed' when m.waiting_since is not null then 'waiting' else 'open' end,
         coalesce(m.severity, 'normal'), m.assigned_to, m.snoozed_until, coalesce(m.tags, '{}'), null::timestamptz, u.reason
    from public.user_reports u left join public.profiles p on p.user_id = u.reported_user_id
    left join public.hq_inbox_meta m on m.kind = 'user_report' and m.ref_id = u.id
  union all
  select 'privacy_request', q.id, q.created_at, initcap(q.request_type) || ' request', null, q.email, q.user_id, null,
         case when q.status not in ('pending', 'in_progress') then 'closed' when m.waiting_since is not null then 'waiting' else 'open' end,
         coalesce(m.severity, 'urgent'), m.assigned_to, m.snoozed_until, coalesce(m.tags, '{}'), null::timestamptz, q.request_type
    from public.privacy_requests q left join public.hq_inbox_meta m on m.kind = 'privacy_request' and m.ref_id = q.id
  union all
  select 'treat_claim', tc.id, tc.claimed_at, 'Treat claim: ' || replace(tc.tier, '_', ' '), null, null, tc.user_id, null,
         case when tc.status <> 'pending' then 'closed' when m.waiting_since is not null then 'waiting' else 'open' end,
         coalesce(m.severity, 'normal'), m.assigned_to, m.snoozed_until, coalesce(m.tags, '{}'), tc.fulfilled_at, tc.tier
    from public.treat_claims tc left join public.hq_inbox_meta m on m.kind = 'treat_claim' and m.ref_id = tc.id`;
const DUE = `x.created_at + case x.severity when 'urgent' then interval '2 hours' when 'high' then interval '8 hours' when 'low' then interval '3 days' else interval '24 hours' end`;
const SNOOZED = `(x.snoozed_until is not null and x.snoozed_until > now())`;

type InboxFilter = { view: typeof VIEWS[number]; kind: string; tag: string; q: string };
function readInboxFilter(v: unknown): InboxFilter {
  const f = (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
  only(f, ['view', 'kind', 'tag', 'q']);
  return { view: (oneOf(f.view, VIEWS, { optional: true }) || 'open') as InboxFilter['view'], kind: oneOf(f.kind, KINDS, { optional: true }),
    tag: str(f.tag, 40, { optional: true }), q: str(f.q, 100, { optional: true }).toLowerCase() };
}
function inboxWhere(ctx: Ctx, f: InboxFilter, skipView = false) {
  const w: string[] = [], p: unknown[] = [];
  const kinds = KINDS.filter((k) => canSee(ctx, k) && (!f.kind || f.kind === k));
  p.push(kinds); w.push(`x.kind = any($${p.length}::text[])`);
  if (!skipView) {
    if (f.view === 'closed') w.push("x.state = 'closed'");
    else if (f.view === 'snoozed') w.push(`x.state <> 'closed' and ${SNOOZED}`);
    else if (f.view === 'waiting') w.push(`x.state = 'waiting' and not ${SNOOZED}`);
    else {
      w.push(`x.state = 'open' and not ${SNOOZED}`);
      if (f.view === 'unassigned') w.push('x.assigned_to is null');
      if (f.view === 'mine') { p.push(ctx.staff.userId); w.push(`x.assigned_to = $${p.length}`); }
    }
  }
  if (f.tag) { p.push(f.tag); w.push(`$${p.length} = any(x.tags)`); }
  if (f.q) { p.push('%' + f.q.replace(/[%_\\]/g, (m) => '\\' + m) + '%'); w.push(`(lower(coalesce(x.title, '')) like $${p.length} or lower(coalesce(x.person, '')) like $${p.length}${has(ctx, 'users_contact') ? ` or lower(coalesce(x.email, '')) like $${p.length}` : ''})`); }
  return { sql: w.join(' and '), params: p };
}

// ---------- kind-specific state (tickets use their own columns; the rest use hq_inbox_meta) ----------
async function metaUpsert(c: PoolClient, kind: Kind, id: string, set: Record<string, unknown>, userId: string) {
  const cols = Object.keys(set);
  const allowed = ['assigned_to', 'severity', 'snoozed_until', 'waiting_since', 'tags'];
  if (!cols.every((k) => allowed.includes(k))) throw bad();
  const vals = cols.map((k) => set[k]);
  await c.query(
    `insert into public.hq_inbox_meta (kind, ref_id, ${cols.join(', ')}, updated_at, updated_by)
     values ($1, $2, ${cols.map((_, i) => '$' + (i + 3)).join(', ')}, now(), $${cols.length + 3})
     on conflict (kind, ref_id) do update set ${cols.map((k) => `${k} = excluded.${k}`).join(', ')}, updated_at = now(), updated_by = excluded.updated_by`,
    [kind, id, ...vals, userId]);
}
const TABLE: Record<Kind, string> = {
  support_ticket: 'support_tickets', listing_change: 'listing_change_requests', business_claim: 'business_claims',
  place_report: 'location_reports', user_report: 'user_reports', privacy_request: 'privacy_requests', treat_claim: 'treat_claims',
};
async function stateOf(c: PoolClient | Pool, kind: Kind, id: string) {
  const row = (await c.query(`select to_jsonb(t) as r from public.${TABLE[kind]} t where t.id = $1`, [id])).rows[0]?.r ?? null;
  const meta = kind === 'support_ticket' ? null : (await c.query('select to_jsonb(m) as r from public.hq_inbox_meta m where kind = $1 and ref_id = $2', [kind, id])).rows[0]?.r ?? null;
  return row ? { row, meta } : null;
}
function readRef(a: Record<string, unknown>, ctx: Ctx) {
  const kind = oneOf(a.kind, KINDS) as Kind;
  if (!canSee(ctx, kind)) throw new HttpError(403, 'You do not have access to this');
  return { kind, id: uuid(a.id) };
}
// One pattern for triage changes: permission, before, change, after, audit.
function triage(pool: Pool, ctx: Ctx, kind: Kind, id: string, action: string, detail: string,
  fn: (c: PoolClient, before: any) => Promise<void>) {
  return writeTx(pool, ctx.staff.userId, async (c, audit) => {
    const before = await stateOf(c, kind, id);
    if (!before) throw new HttpError(404, 'That request no longer exists.');
    await fn(c, before);
    await audit({ action, entity: TABLE[kind], entityId: id, detail, before, after: await stateOf(c, kind, id) });
    return { ok: true, message: 'Saved.' };
  });
}

// Customer panel: plan, trial, dogs, recent reviews and reports, past conversations.
async function customer(pool: Pool, ctx: Ctx, userId: string | null, email: string | null) {
  let uid = userId;
  if (!uid && email) uid = (await pool.query('select id from auth.users where lower(email) = lower($1) limit 1', [email])).rows[0]?.id ?? null;
  const contact = has(ctx, 'users_contact');
  if (!uid) {
    const past = email ? (await pool.query('select id, subject, status, created_at from public.support_tickets where lower(email) = lower($1) order by created_at desc limit 10', [email])).rows : [];
    return { known: false, email: contact ? email : null, conversations: past };
  }
  const [p, dogs, revs, reps, conv] = await Promise.all([
    pool.query(`select p.full_name, p.created_at, p.is_banned, p.review_count, u.email, s.plan, s.status as sub_status, s.trial_end
                  from public.profiles p left join auth.users u on u.id = p.user_id left join public.subscriptions s on s.user_id = p.user_id where p.user_id = $1`, [uid]),
    pool.query('select name, breed from public.dog_profiles where user_id = $1 order by created_at limit 10', [uid]),
    pool.query('select r.paw_rating, r.status, r.created_at, l.name as place from public.reviews r left join public.locations l on l.id = r.location_id where r.user_id = $1 order by r.created_at desc limit 5', [uid]),
    pool.query('select reason, status, created_at from public.user_reports where reported_user_id = $1 order by created_at desc limit 5', [uid]),
    pool.query(`select id, subject, status, created_at from public.support_tickets where user_id = $1 or lower(email) = lower((select email from auth.users where id = $1)) order by created_at desc limit 10`, [uid]),
  ]);
  const prof = p.rows[0] || {};
  return { known: true, user_id: uid, name: prof.full_name || '', email: contact ? prof.email || null : null, plan: prof.plan || null, sub_status: prof.sub_status || null,
    trial_end: prof.trial_end || null, joined: prof.created_at || null, banned: !!prof.is_banned, review_count: prof.review_count || 0,
    dogs: dogs.rows, reviews: revs.rows, reports: reps.rows, conversations: conv.rows };
}

async function declineEmail(to: string, name: string, place: string, reason: string) {
  if (!RESEND_API_KEY || !to) return false;
  const text = `Hi${name ? ' ' + name : ''},\n\nThank you for asking us to update ${place} on BarkFind. We have not made this change: ${reason}\n\nIf anything has changed, just reply to this email.\n\nJosh, BarkFind`;
  const { error } = await new Resend(RESEND_API_KEY).emails.send({ from: 'BarkFind <support@barkfind.com>', to, subject: `Your change to ${place} on BarkFind`, text });
  if (error) { console.error('hq decline email', error.name); return false; }
  return true;
}

export function inboxOps(pool: Pool): Record<string, Op> {
  const ops: Record<string, Op> = {
    // The figures at the top: the four support figures plus breaching target across every kind.
    inbox_counts: {
      perm: 'support_read',
      run: async (a, ctx) => {
        const f = readInboxFilter(only(a, ['filter']).filter);
        const base = inboxWhere(ctx, { ...f, view: 'open' }, true);
        const r = await pool.query(
          `select count(*) filter (where x.state = 'open' and not ${SNOOZED} and x.assigned_to is null)::int as unassigned,
                  count(*) filter (where x.state = 'open' and not ${SNOOZED} and x.assigned_to = $${base.params.length + 1})::int as mine,
                  count(*) filter (where x.state = 'open' and not ${SNOOZED})::int as open,
                  count(*) filter (where x.state = 'waiting' and not ${SNOOZED})::int as waiting,
                  count(*) filter (where x.state <> 'closed' and ${SNOOZED})::int as snoozed,
                  count(*) filter (where x.state = 'open' and not ${SNOOZED} and x.first_reply_at is null and ${DUE} < now())::int as breaching
             from (${UNION}) x where ${base.sql}`, [...base.params, ctx.staff.userId]);
        const sla = has(ctx, 'support_read') ? (await pool.query(
          `select round((avg(extract(epoch from (fr.first_reply - t.created_at)) / 3600) filter (where fr.first_reply is not null))::numeric, 1) as avg_first_h,
                  count(*) filter (where t.status in ('open', 'in_progress', 'waiting'))::int as open_now,
                  count(*) filter (where t.status in ('open', 'in_progress') and t.created_at < now() - interval '24 hours')::int as ageing,
                  count(*) filter (where fr.first_reply is null and t.status <> 'resolved')::int as awaiting
             from public.support_tickets t left join (select ticket_id, min(created_at) first_reply from public.support_responses group by ticket_id) fr on fr.ticket_id = t.id`)).rows[0] : {};
        const tags = (await pool.query(`select distinct unnest(x.tags) as t from (${UNION}) x where ${base.sql} order by 1 limit 100`, base.params)).rows.map((x) => x.t);
        return { data: { views: r.rows[0], sla, tags, kinds: KINDS.filter((k) => canSee(ctx, k)) } };
      },
    },
    inbox_list: {
      perm: 'support_read',
      run: async (a, ctx) => {
        only(a, ['filter', 'page']);
        const f = readInboxFilter(a.filter);
        const page = Number.isInteger(a.page) && (a.page as number) >= 0 && (a.page as number) < 1000 ? a.page as number : 0;
        const w = inboxWhere(ctx, f);
        const order = f.view === 'closed' ? 'x.created_at desc' : `(case when x.first_reply_at is null then ${DUE} else 'infinity'::timestamptz end), x.created_at`;
        const r = await pool.query(
          `select x.kind, x.id, x.created_at, x.title, x.person, x.email, x.state, x.severity, x.assigned_to, x.snoozed_until, x.tags, x.first_reply_at, x.detail,
                  ${DUE} as due_at, coalesce(s.display_name, s.email) as assignee,
                  (select coalesce(jsonb_agg(coalesce(vs.display_name, vs.email)), '[]') from public.hq_viewing v join public.hq_staff vs on vs.user_id = v.user_id
                    where v.kind = x.kind and v.ref_id = x.id and v.user_id <> $${w.params.length + 1} and v.seen_at > now() - interval '60 seconds') as viewers
             from (${UNION}) x left join public.hq_staff s on s.user_id = x.assigned_to
            where ${w.sql} order by ${order} limit ${PAGE} offset ${page * PAGE}`, [...w.params, ctx.staff.userId]);
        const total = (await pool.query(`select count(*)::int n from (${UNION}) x where ${w.sql}`, w.params)).rows[0].n;
        return { data: { rows: r.rows.map((x) => ({ ...x, email: has(ctx, 'users_contact') ? x.email : null })), total, page, page_size: PAGE } };
      },
    },
    // One conversation, with what each kind needs, and the customer panel.
    inbox_get: {
      perm: 'support_read',
      run: async (a, ctx) => {
        const { kind, id } = readRef(only(a, ['kind', 'id']), ctx);
        const st = await stateOf(pool, kind, id);
        if (!st) throw new HttpError(404, 'That request no longer exists.');
        const row: any = st.row, extra: any = {};
        if (kind === 'support_ticket') {
          const [resp, notes, macros] = await Promise.all([
            pool.query('select body, status, error, created_at from public.support_responses where ticket_id = $1 order by created_at', [id]),
            pool.query('select body, created_at from public.support_notes where ticket_id = $1 order by created_at', [id]),
            pool.query('select id, title, body from public.support_macros order by title'),
          ]);
          Object.assign(extra, { responses: resp.rows, notes: notes.rows, macros: macros.rows });
        }
        if (kind === 'listing_change') {
          const loc = (await pool.query(`select id, name, address, opening_hours, dog_policy, dog_policy_note, website, image_url, flagged, locked_fields, place_id from public.locations where id = $1`, [row.location_id])).rows[0] || null;
          extra.location = loc;
        }
        if (row.location_id && kind !== 'listing_change') extra.place = (await pool.query('select id, name, address, place_id from public.locations where id = $1', [row.location_id])).rows[0] || null;
        const email = row.email || row.claimant_email || row.requester_email || null;
        const userId = row.user_id || row.requested_by || (kind === 'user_report' ? row.reported_user_id : null) || null;
        const cust = await customer(pool, ctx, userId, email);
        const contact = has(ctx, 'users_contact');
        for (const k of ['email', 'claimant_email', 'claimant_phone', 'requester_email']) if (k in row && !contact) row[k] = null;
        const staff = (await pool.query("select user_id as id, coalesce(display_name, email) as name from public.hq_staff where status = 'active' order by 2")).rows;
        return { data: { kind, row, meta: st.meta, customer: cust, staff, ...extra,
          can: { reply: has(ctx, 'support_reply'), assign: has(ctx, 'support_assign'), apply: has(ctx, 'places_edit'), contact } } };
      },
    },
    inbox_assign: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        only(a, ['kind', 'id', 'user_id']);
        const { kind, id } = readRef(a, ctx);
        const to = a.user_id === null || a.user_id === '' ? null : uuid(a.user_id);
        // Assigning to yourself needs support_reply; to anyone else, support_assign.
        if (to !== ctx.staff.userId && !has(ctx, 'support_assign')) throw new HttpError(403, 'You do not have access to this');
        if (to) { const ok = (await pool.query("select 1 from public.hq_staff where user_id = $1 and status = 'active'", [to])).rows.length; if (!ok) throw bad(); }
        return triage(pool, ctx, kind, id, 'inbox_assign', to ? 'Assigned' : 'Unassigned', async (c) => {
          if (kind === 'support_ticket') await c.query('update public.support_tickets set assigned_to = $2, updated_at = now() where id = $1', [id, to]);
          else await metaUpsert(c, kind, id, { assigned_to: to }, ctx.staff.userId);
        });
      },
    },
    inbox_severity: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        only(a, ['kind', 'id', 'severity']);
        const { kind, id } = readRef(a, ctx);
        const sev = oneOf(a.severity, SEVERITIES) as string;
        return triage(pool, ctx, kind, id, 'inbox_severity', `Severity set to ${sev}`, async (c) => {
          if (kind === 'support_ticket') await c.query('update public.support_tickets set priority = $2, updated_at = now() where id = $1', [id, sev]);
          else await metaUpsert(c, kind, id, { severity: sev }, ctx.staff.userId);
        });
      },
    },
    inbox_snooze: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        only(a, ['kind', 'id', 'until']);
        const { kind, id } = readRef(a, ctx);
        let until: string | null = null;
        if (a.until !== null && a.until !== '') {
          const t = typeof a.until === 'string' ? Date.parse(a.until) : NaN;
          if (!Number.isFinite(t) || t < Date.now() || t > Date.now() + 366 * 864e5) throw bad();
          until = new Date(t).toISOString();
        }
        return triage(pool, ctx, kind, id, 'inbox_snooze', until ? `Snoozed until ${until.slice(0, 16).replace('T', ' ')}` : 'Woke up', async (c) => {
          if (kind === 'support_ticket') await c.query('update public.support_tickets set snoozed_until = $2, updated_at = now() where id = $1', [id, until]);
          else await metaUpsert(c, kind, id, { snoozed_until: until }, ctx.staff.userId);
        });
      },
    },
    // Waiting on the customer (on) or back to Open (off). Closing uses each kind's own action.
    inbox_waiting: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        only(a, ['kind', 'id', 'on']);
        const { kind, id } = readRef(a, ctx);
        if (typeof a.on !== 'boolean') throw bad();
        const on = a.on;
        return triage(pool, ctx, kind, id, 'inbox_waiting', on ? 'Waiting on customer' : 'Back to open', async (c, before) => {
          if (kind === 'support_ticket') {
            if (before.row.status === 'resolved' && on) throw new HttpError(409, 'Reopen it first.');
            await c.query('update public.support_tickets set status = $2, updated_at = now() where id = $1', [id, on ? 'waiting' : 'open']);
          } else await metaUpsert(c, kind, id, { waiting_since: on ? new Date().toISOString() : null }, ctx.staff.userId);
        });
      },
    },
    inbox_tags: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        only(a, ['kind', 'id', 'tags']);
        const { kind, id } = readRef(a, ctx);
        if (!Array.isArray(a.tags) || a.tags.length > 12) throw bad();
        const tags = [...new Set(a.tags.map((t) => str(t, 40, { min: 1 })))];
        return triage(pool, ctx, kind, id, 'inbox_tags', 'Changed tags', async (c) => {
          if (kind === 'support_ticket') await c.query('update public.support_tickets set tags = $2::text[], updated_at = now() where id = $1', [id, tags]);
          else await metaUpsert(c, kind, id, { tags }, ctx.staff.userId);
        });
      },
    },
    // Reply to a ticket: queued through hq_action (send-support-reply emails it), then
    // Waiting on customer, or Closed with "send and close". One transaction, audited.
    inbox_reply: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        only(a, ['id', 'body', 'close']);
        const id = uuid(a.id); const body = str(a.body, 10000, { min: 1 });
        const close = a.close === true;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await stateOf(c, 'support_ticket', id);
          if (!before) throw new HttpError(404, 'That ticket no longer exists.');
          const r = (await c.query('select public.hq_action($1, $2::jsonb) as r', ['reply_ticket', JSON.stringify({ ticket_id: id, body, resolve: close })])).rows[0].r;
          if (!r || r.ok === false) throw new HttpError(400, (r && r.message) || 'The reply was not queued.');
          if (!close) await c.query("update public.support_tickets set status = 'waiting', snoozed_until = null, updated_at = now() where id = $1", [id]);
          await c.query("update public.admin_audit set actor_user_id = $1, entity = 'support_tickets', detail = $2, before = $3::jsonb, after = $4::jsonb where actor = 'hq' and actor_user_id is null and created_at = now()",
            [ctx.staff.userId, close ? 'Replied and closed' : 'Replied, waiting on customer', JSON.stringify(before), JSON.stringify(await stateOf(c, 'support_ticket', id))]);
          void audit;
          return { ok: true, message: close ? 'Reply queued and conversation closed.' : 'Reply queued. Waiting on the customer.' };
        });
      },
    },
    // "Josh is viewing": refreshed every 20 seconds while a conversation is open.
    inbox_heartbeat: {
      perm: 'support_read',
      run: async (a, ctx) => {
        only(a, ['kind', 'id', 'action']);
        const { kind, id } = readRef(a, ctx);
        const action = oneOf(a.action, ['viewing', 'replying'] as const, { optional: true }) || 'viewing';
        await pool.query("delete from public.hq_viewing where seen_at < now() - interval '10 minutes'");
        await pool.query(`insert into public.hq_viewing (kind, ref_id, user_id, action, seen_at) values ($1, $2, $3, $4, now())
                          on conflict (kind, ref_id, user_id) do update set action = excluded.action, seen_at = now()`, [kind, id, ctx.staff.userId, action]);
        const r = await pool.query(`select coalesce(s.display_name, s.email) as name, v.action from public.hq_viewing v join public.hq_staff s on s.user_id = v.user_id
                                     where v.kind = $1 and v.ref_id = $2 and v.user_id <> $3 and v.seen_at > now() - interval '60 seconds'`, [kind, id, ctx.staff.userId]);
        return { data: r.rows };
      },
    },
    inbox_leave: {
      perm: 'support_read',
      run: async (a, ctx) => {
        const { kind, id } = readRef(only(a, ['kind', 'id']), ctx);
        await pool.query('delete from public.hq_viewing where kind = $1 and ref_id = $2 and user_id = $3', [kind, id, ctx.staff.userId]);
        return { ok: true };
      },
    },

    // ---------- listing changes ----------
    places_search: {
      perm: 'places_edit',
      run: async (a) => {
        const q = str(only(a, ['q']).q, 100, { min: 2 }).toLowerCase().replace(/[%_\\]/g, (m) => '\\' + m);
        const r = await pool.query(`select id, name, coalesce(left(address, 80), '') as address, category, flagged from public.locations
                                     where lower(name) like $1 or lower(coalesce(address, '')) like $1 order by (lower(name) like $2) desc, name limit 20`, ['%' + q + '%', q + '%']);
        return { data: r.rows };
      },
    },
    // A request typed in from an email or a call (source hq or email).
    listing_change_create: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['location_id', 'changes', 'requester_name', 'requester_email', 'requester_role', 'message', 'source']);
        const loc = uuid(a.location_id);
        const changes = readChanges(a.changes);
        const source = oneOf(a.source, ['hq', 'email'] as const, { optional: true }) || 'hq';
        const role = oneOf(a.requester_role, ['business', 'user'] as const, { optional: true }) || 'business';
        const email = str(a.requester_email, 254, { optional: true });
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad();
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const cur = (await c.query(`select name, address, opening_hours, dog_policy, dog_policy_note, website, image_url, flagged from public.locations where id = $1`, [loc])).rows[0];
          if (!cur) throw new HttpError(404, 'That place no longer exists.');
          const current: Record<string, unknown> = {};
          for (const k of Object.keys(changes)) current[k] = k === 'closed' ? !!cur.flagged : cur[k];
          const r = await c.query(`insert into public.listing_change_requests (location_id, requester_name, requester_email, requester_role, changes, current_values, message, source)
                                   values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) returning to_jsonb(listing_change_requests) as r`,
            [loc, str(a.requester_name, 120, { optional: true }) || null, email || null, role, JSON.stringify(changes), JSON.stringify(current), str(a.message, 2000, { optional: true }) || null, source]);
          await audit({ action: 'listing_change_create', entity: 'listing_change_requests', entityId: r.rows[0].r.id, detail: `Logged a change request for ${cur.name}`, after: r.rows[0].r });
          return { ok: true, message: 'Change request added to the inbox.', id: r.rows[0].r.id };
        });
      },
    },
    // Apply: writes the chosen fields to the place, locks them against the Google upserts
    // (locked_fields, details_set_at, details_set_by in the same update), audited.
    listing_change_apply: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'fields']);
        const id = uuid(a.id);
        if (!Array.isArray(a.fields) || !a.fields.length) throw bad();
        const fields = [...new Set(a.fields.map((f) => oneOf(f, LISTING_FIELDS) as string))];
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const req = (await c.query('select * from public.listing_change_requests where id = $1 for update', [id])).rows[0];
          if (!req) throw new HttpError(404, 'That request no longer exists.');
          if (req.status !== 'pending') throw new HttpError(409, 'That request has already been decided.');
          const ch = readChanges(req.changes);
          if (!fields.every((f) => f in ch)) throw bad();
          const before = (await c.query('select to_jsonb(l) as r from public.locations l where id = $1', [req.location_id])).rows[0]?.r;
          if (!before) throw new HttpError(404, 'That place no longer exists.');
          const detailFields = fields.filter((f) => f !== 'closed');
          if (detailFields.length) {
            const setCols = detailFields.map((f, i) => `${f} = $${i + 2}${f === 'opening_hours' ? '::jsonb' : ''}`);
            const vals = detailFields.map((f) => (f === 'opening_hours' ? JSON.stringify(ch[f]) : ch[f]));
            await c.query(
              `update public.locations set ${setCols.join(', ')},
                      locked_fields = (select array(select distinct unnest(locked_fields || $${detailFields.length + 2}::text[]))),
                      details_set_at = now(), details_set_by = $${detailFields.length + 3}
                where id = $1`, [req.location_id, ...vals, detailFields.map((f) => (f === 'dog_policy_note' ? 'dog_policy' : f)), ctx.staff.userId]);
          }
          if (fields.includes('closed') && ch.closed === true) {
            await c.query("update public.locations set flagged = true, flagged_at = now(), flag_reason = 'Permanently closed (listing change)', flag_rule = 'manual', flagged_by = $2 where id = $1", [req.location_id, ctx.staff.userId]);
          }
          await c.query("update public.listing_change_requests set status = 'applied', decided_by = $2, decided_at = now(), updated_at = now() where id = $1", [id, ctx.staff.userId]);
          const after = (await c.query('select to_jsonb(l) as r from public.locations l where id = $1', [req.location_id])).rows[0]?.r;
          await audit({ action: 'listing_change_apply', entity: 'locations', entityId: req.location_id, detail: `Applied a listing change (${fields.join(', ')}) to ${before.name}`, before, after });
          return { ok: true, message: 'Change applied to the place and locked against automatic updates.' };
        });
      },
    },
    listing_change_decline: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'reason']);
        const id = uuid(a.id); const reason = str(a.reason, 1000, { min: 1 });
        const res = await writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query('select to_jsonb(r) as r from public.listing_change_requests r where id = $1 for update', [id])).rows[0]?.r;
          if (!before) throw new HttpError(404, 'That request no longer exists.');
          if (before.status !== 'pending') throw new HttpError(409, 'That request has already been decided.');
          await c.query("update public.listing_change_requests set status = 'declined', decline_reason = $2, decided_by = $3, decided_at = now(), updated_at = now() where id = $1", [id, reason, ctx.staff.userId]);
          const place = (await c.query('select name from public.locations where id = $1', [before.location_id])).rows[0]?.name || 'your place';
          await audit({ action: 'listing_change_decline', entity: 'listing_change_requests', entityId: id, detail: 'Declined a listing change', before, after: { ...before, status: 'declined', decline_reason: reason } });
          return { place, email: before.requester_email as string | null, name: before.requester_name as string | null };
        });
        const sent = res.email ? await declineEmail(res.email, res.name || '', res.place, reason) : false;
        return { ok: true, message: sent ? 'Declined, and the reason was emailed to them.' : res.email ? 'Declined. The email did not send, so tell them yourself.' : 'Declined. There is no email address on this request, so tell them yourself.' };
      },
    },
  };
  return ops;
}

// Validates a changes object: only the allowed fields, with sensible values.
function readChanges(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad();
  const o = v as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(o)) {
    if (!(LISTING_FIELDS as readonly string[]).includes(k)) throw bad();
    if (k === 'closed') { if (typeof val !== 'boolean') throw bad(); out[k] = val; }
    else if (k === 'opening_hours') { if (!Array.isArray(val) || val.length > 14) throw bad(); out[k] = val.map((x) => str(x, 80, { min: 1 })); }
    else if (k === 'dog_policy') out[k] = oneOf(val, DOG_POLICIES);
    else if (k === 'website' || k === 'image_url') { const s = str(val, 500, { min: 1 }); if (!/^https:\/\//i.test(s)) throw bad(); out[k] = s; }
    else out[k] = str(val, k === 'dog_policy_note' ? 500 : 200, { min: 1 });
  }
  if (!Object.keys(out).length) throw bad();
  return out;
}
