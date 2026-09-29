// Phase 1 ops for /api/hq: Safety, Reviews, Reports, Claims, Support and Users.
// Every op names the one permission it needs. Reads return personal data only to
// render the page (never logged, never sent to Claude); emails and phone numbers
// are left out unless the caller has users_contact. Writes go through writeTx, so
// each one lands with its admin_audit row (before and after) or not at all.
import type { Pool, PoolClient } from 'pg';
import { HttpError, bad, only, uuid, str, oneOf, writeTx, toTrash, scrubEmails } from './hq-core.js';
import type { Perm, Staff } from './hq-staff.js';

export type Ctx = { staff: Staff; token: string };
export type Op = { perm: Perm; run: (a: Record<string, unknown>, ctx: Ctx) => Promise<unknown> };
type Deps = { claude: (operation: string, prompt: string, userId: string) => Promise<unknown> };

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// Period filters: fixed SQL fragments chosen by key, never text from the request.
const PERIODS = { today: "date_trunc('day', now())", '7d': "now() - interval '7 days'", '30d': "now() - interval '30 days'", '90d': "now() - interval '90 days'", all: "'-infinity'::timestamptz" } as const;
type PeriodKey = keyof typeof PERIODS;
const period = (v: unknown) => PERIODS[(oneOf(v, Object.keys(PERIODS) as PeriodKey[], { optional: true }) || 'all') as PeriodKey];

const CSAE = `coalesce(r.ai_flags, '[]'::jsonb) @> '["csae_escalate"]'::jsonb`;
const can = (ctx: Ctx, p: Perm) => ctx.staff.perms.has(p);
const need = (ctx: Ctx, p: Perm) => { if (!can(ctx, p)) throw new HttpError(403, 'You do not have access to this'); };
const contact = (ctx: Ctx, v: unknown) => (can(ctx, 'users_contact') ? v ?? null : null);

async function rowJson(c: PoolClient | Pool, table: 'locations' | 'reviews' | 'business_claims' | 'support_tickets' | 'privacy_requests' | 'location_reports' | 'profiles', id: string, col = 'id') {
  const r = await c.query(`select to_jsonb(t) as r from public.${table} t where t.${col === 'user_id' ? 'user_id' : 'id'} = $1`, [id]);
  return r.rows[0]?.r ?? null;
}

export function actOps(pool: Pool, deps: Deps): Record<string, Op> {
  return {
    // ---------- Safety ----------
    safety_list: {
      perm: 'safety',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(
          `select r.id, r.review_text, r.created_at, r.status, r.ai_reason, r.paw_rating, l.name as place
             from public.reviews r left join public.locations l on l.id = r.location_id
            where ${CSAE} order by r.created_at desc limit 200`);
        return { data: r.rows };
      },
    },
    privacy_list: {
      perm: 'privacy',
      run: async (a, ctx) => {
        only(a, []);
        // Open matches hq_snapshot(): pending or in_progress.
        const r = await pool.query(
          `select id, email, request_type, details, status, created_at from public.privacy_requests
            where status in ('pending', 'in_progress') order by created_at limit 200`);
        return { data: r.rows.map((x) => ({ ...x, email: contact(ctx, x.email) })) };
      },
    },
    privacy_processed: {
      perm: 'privacy',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowJson(c, 'privacy_requests', id);
          if (!before) throw new HttpError(404, 'That request no longer exists.');
          await c.query("update public.privacy_requests set status = 'completed', processed_at = now() where id = $1", [id]);
          const after = await rowJson(c, 'privacy_requests', id);
          await audit({ action: 'privacy_processed', entity: 'privacy_requests', entityId: id, detail: 'Marked privacy request processed', before, after });
          return { ok: true, message: 'Marked processed.' };
        });
      },
    },

    // ---------- Reviews ----------
    reviews_list: {
      perm: 'reviews',
      run: async (a, ctx) => {
        only(a, ['period']);
        const since = period(a.period);
        // Child-safety escalations only appear here for people with the safety permission.
        const r = await pool.query(
          `select r.id, r.paw_rating, r.subjective_ratings, r.amenities, r.images, r.review_text, r.created_at,
                  r.ai_status, r.ai_reason, r.ai_confidence, r.ai_flags, l.name as place
             from public.reviews r left join public.locations l on l.id = r.location_id
            where r.status = 'pending' and r.created_at >= ${since} ${can(ctx, 'safety') ? '' : `and not ${CSAE}`}
            order by r.created_at limit 300`);
        return { data: r.rows };
      },
    },
    reviews_bulk_approve_ai: {
      perm: 'reviews',
      run: async (a, ctx) => {
        only(a, []);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          // Same as /admin: approve every pending review the AI cleared and log it in moderation_log.
          // Escalated reviews are never bulk-approved.
          const r = await c.query(
            `with upd as (
               update public.reviews r set status = 'approved', approved_at = now(), moderated_at = now(), moderation_source = 'admin-bulk'
                where r.status = 'pending' and r.ai_status = 'approve' and not ${CSAE}
                returning r.id, r.ai_status, r.ai_confidence, r.ai_flags)
             insert into public.moderation_log (review_id, ai_status, ai_confidence, ai_flags, final_status, agreed, source)
             select id, ai_status, ai_confidence, ai_flags, 'approved', true, 'admin-bulk' from upd
             returning review_id`);
          const ids = r.rows.map((x) => x.review_id);
          await audit({ action: 'reviews_bulk_approve_ai', entity: 'reviews', entityId: null, detail: `Bulk-approved ${ids.length} AI-cleared review(s)`, before: { status: 'pending', ids }, after: { status: 'approved', ids } });
          return { ok: true, message: ids.length ? `Approved ${ids.length} review(s).` : 'Nothing to approve.', count: ids.length };
        });
      },
    },
    flagged_list: {
      perm: 'places_edit',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(
          `select id, name, category, coalesce(left(address, 60), '') as address, flag_reason, flagged_at
             from public.locations where flagged = true order by flagged_at desc nulls last limit 2000`);
        return { data: r.rows };
      },
    },
    place_unflag: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowJson(c, 'locations', id);
          if (!before) throw new HttpError(404, 'That place no longer exists.');
          await c.query('update public.locations set flagged = false, flag_reason = null, flagged_at = null where id = $1', [id]);
          const after = await rowJson(c, 'locations', id);
          await audit({ action: 'place_unflag', entity: 'locations', entityId: id, detail: `Unflagged ${String(before.name || 'a place').slice(0, 80)}`, before, after });
          return { ok: true, message: 'Unflagged.' };
        });
      },
    },

    // ---------- Reports ----------
    reports_list: {
      perm: 'reports',
      run: async (a, ctx) => {
        only(a, ['period']);
        const since = period(a.period);
        const ur = await pool.query(
          `select ur.id, ur.reason, ur.status, ur.created_at, ur.reported_user_id, ur.review_id,
                  ru.email as reported_email, rp.email as reporter_email, rpp.full_name as reported_name,
                  left(r.review_text, 800) as review_text, l.name as place
             from public.user_reports ur
             left join auth.users ru on ru.id = ur.reported_user_id
             left join auth.users rp on rp.id = ur.reporter_id
             left join public.profiles rpp on rpp.user_id = ur.reported_user_id
             left join public.reviews r on r.id = ur.review_id
             left join public.locations l on l.id = r.location_id
            where ur.status = 'pending' and ur.created_at >= ${since} order by ur.created_at limit 200`);
        const lr = await pool.query(
          `select lr.id, lr.reason, lr.details, lr.created_at, l.id as location_id, l.name as place, coalesce(left(l.address, 60), '') as address
             from public.location_reports lr left join public.locations l on l.id = lr.location_id
            where lr.status = 'open' and lr.created_at >= ${since} order by lr.created_at desc limit 200`);
        return {
          data: {
            user_reports: ur.rows.map((x) => ({ ...x, reported_email: contact(ctx, x.reported_email), reporter_email: contact(ctx, x.reporter_email) })),
            location_reports: lr.rows,
          },
        };
      },
    },
    // /admin's "Flag location" on a place report: flags the place and actions the report together.
    report_flag_place: {
      perm: 'reports',
      run: async (a, ctx) => {
        only(a, ['report_id', 'reason']);
        const reportId = uuid(a.report_id);
        const reason = str(a.reason, 200, { min: 1 });
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const rep = await rowJson(c, 'location_reports', reportId);
          if (!rep || !rep.location_id) throw new HttpError(404, 'That report no longer exists.');
          const before = await rowJson(c, 'locations', rep.location_id);
          await c.query('update public.locations set flagged = true, flag_reason = $2, flagged_at = now() where id = $1', [rep.location_id, reason]);
          await c.query("update public.location_reports set status = 'actioned' where id = $1", [reportId]);
          const after = await rowJson(c, 'locations', rep.location_id);
          await audit({ action: 'report_flag_place', entity: 'locations', entityId: rep.location_id, detail: `Flagged from a place report: ${reason.slice(0, 80)}`, before, after });
          return { ok: true, message: 'Place flagged and report closed.' };
        });
      },
    },

    // ---------- Claims ----------
    claims_list: {
      perm: 'claims',
      run: async (a, ctx) => {
        only(a, []);
        const r = await pool.query(
          `select bc.id, bc.status, bc.evidence_url, bc.created_at, bc.claimant_name, bc.claimant_email, bc.claimant_phone, bc.message,
                  l.name as place, coalesce(left(l.address, 55), '') as address, l.website,
                  p.full_name as account_name, u.email as account_email, u.created_at as account_created
             from public.business_claims bc
             left join public.locations l on l.id = bc.location_id
             left join public.profiles p on p.user_id = bc.user_id
             left join auth.users u on u.id = bc.user_id
            order by (bc.status = 'pending') desc, bc.created_at desc limit 200`);
        return {
          data: r.rows.map((x) => ({
            ...x,
            email_differs: !!(x.claimant_email && x.account_email && String(x.claimant_email).trim().toLowerCase() !== String(x.account_email).trim().toLowerCase()),
            claimant_email: contact(ctx, x.claimant_email), claimant_phone: contact(ctx, x.claimant_phone), account_email: contact(ctx, x.account_email),
          })),
        };
      },
    },
    // AI assessment with no name, email or phone: the place, the message, the evidence link
    // and a few signals worked out here on the server.
    claim_assess: {
      perm: 'claims',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        const r = await pool.query(
          `select bc.status, bc.evidence_url, bc.message, bc.claimant_email, bc.claimant_phone, l.name as place, l.address, l.website,
                  u.email as account_email, u.created_at as account_created
             from public.business_claims bc left join public.locations l on l.id = bc.location_id left join auth.users u on u.id = bc.user_id
            where bc.id = $1`, [id]);
        const c = r.rows[0];
        if (!c) throw new HttpError(404, 'That claim no longer exists.');
        const domain = (e: unknown) => (typeof e === 'string' && e.includes('@') ? e.split('@').pop()!.trim().toLowerCase() : null);
        let site: string | null = null;
        try { site = c.website ? new URL(/^https?:/i.test(c.website) ? c.website : 'https://' + c.website).hostname.replace(/^www\./, '').toLowerCase() : null; } catch { site = null; }
        const cd = domain(c.claimant_email);
        const facts = scrubEmails({
          place: c.place, address: c.address, message: c.message || 'none provided', evidence_url: c.evidence_url || 'none provided', current_status: c.status,
          signals: {
            claim_email_domain_matches_place_website: cd && site ? (cd === site || cd.endsWith('.' + site)) : null,
            claim_email_is_free_webmail: cd ? /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton|protonmail)\./.test(cd) : null,
            claim_email_matches_account_email: c.claimant_email && c.account_email ? String(c.claimant_email).trim().toLowerCase() === String(c.account_email).trim().toLowerCase() : null,
            phone_given: !!c.claimant_phone,
            account_age_days: c.account_created ? Math.floor((Date.now() - new Date(c.account_created).getTime()) / 864e5) : null,
          },
        });
        const prompt = 'You are a BarkFind moderation assistant reviewing a business claim: an owner claiming a dog-friendly place to receive a verified badge in the app. From the evidence, assess how legitimate/plausible the claim looks and flag anything suspicious. Then give a clear recommendation on its own line, exactly one of: RECOMMEND: APPROVE / RECOMMEND: REJECT / RECOMMEND: NEEDS MORE EVIDENCE, with one short reason. Then draft a short reply to the claimant. Be concise, British English, never invent facts. No em dashes.\n\nCLAIM (JSON, personal details removed):\n' + JSON.stringify(facts);
        return deps.claude('hq_claim_assess', prompt, ctx.staff.userId);
      },
    },
    claim_set_status: {
      perm: 'claims',
      run: async (a, ctx) => {
        only(a, ['id', 'status']);
        const id = uuid(a.id);
        const status = oneOf(a.status, ['verified', 'rejected'] as const) as 'verified' | 'rejected';
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowJson(c, 'business_claims', id);
          if (!before) throw new HttpError(404, 'That claim no longer exists.');
          if (before.status !== 'pending') throw new HttpError(409, 'That claim has already been decided.');
          await c.query('update public.business_claims set status = $2 where id = $1', [id, status]);
          if (status === 'verified' && before.location_id) await c.query('update public.locations set barkfind_verified = true where id = $1', [before.location_id]);
          const after = await rowJson(c, 'business_claims', id);
          await audit({ action: 'claim_set_status', entity: 'business_claims', entityId: id, detail: status === 'verified' ? 'Verified business claim' : 'Rejected business claim', before, after: { ...after, place_verified: status === 'verified' } });
          return { ok: true, message: status === 'verified' ? 'Claim verified. The place now shows as verified.' : 'Claim rejected.' };
        });
      },
    },

    // ---------- Support ----------
    tickets_list: {
      perm: 'support',
      run: async (a, ctx) => {
        only(a, ['status', 'period']);
        const status = oneOf(a.status, ['open', 'in_progress', 'resolved'] as const, { optional: true });
        const since = period(a.period);
        const t = await pool.query(
          `select id, full_name, email, subject, category, status, message, priority, tags, created_at, updated_at
             from public.support_tickets where created_at >= ${since} and ($1::text = '' or status = $1)
            order by (case coalesce(priority, 'normal') when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end), created_at desc
            limit 300`, [status]);
        const ids = t.rows.map((x) => x.id);
        const [resp, notes, macros, sla] = await Promise.all([
          ids.length ? pool.query('select id, ticket_id, body, status, error, created_at from public.support_responses where ticket_id = any($1::uuid[]) order by created_at', [ids]) : { rows: [] },
          ids.length ? pool.query('select id, ticket_id, body, created_at from public.support_notes where ticket_id = any($1::uuid[]) order by created_at', [ids]) : { rows: [] },
          pool.query('select id, title, body from public.support_macros order by title'),
          pool.query(
            `select round((avg(extract(epoch from (fr.first_reply - t.created_at)) / 3600) filter (where fr.first_reply is not null))::numeric, 1) as avg_first_h,
                    count(*) filter (where t.status in ('open', 'in_progress')) as open_now,
                    count(*) filter (where t.status in ('open', 'in_progress') and t.created_at < now() - interval '24 hours') as ageing,
                    count(*) filter (where fr.first_reply is null and t.status <> 'resolved') as awaiting
               from public.support_tickets t left join (select ticket_id, min(created_at) first_reply from public.support_responses group by ticket_id) fr on fr.ticket_id = t.id`),
        ]);
        return {
          data: {
            tickets: t.rows.map((x) => ({ ...x, email: contact(ctx, x.email) })),
            responses: resp.rows, notes: notes.rows, macros: macros.rows, sla: sla.rows[0] || {},
          },
        };
      },
    },
    ticket_set_priority: {
      perm: 'support',
      run: async (a, ctx) => {
        only(a, ['id', 'priority']);
        const id = uuid(a.id);
        const priority = oneOf(a.priority, ['low', 'normal', 'high', 'urgent'] as const);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowJson(c, 'support_tickets', id);
          if (!before) throw new HttpError(404, 'That ticket no longer exists.');
          await c.query('update public.support_tickets set priority = $2, updated_at = now() where id = $1', [id, priority]);
          const after = await rowJson(c, 'support_tickets', id);
          await audit({ action: 'ticket_set_priority', entity: 'support_tickets', entityId: id, detail: `Set ticket priority to ${priority}`, before, after });
          return { ok: true, message: 'Priority saved.' };
        });
      },
    },
    ticket_set_tags: {
      perm: 'support',
      run: async (a, ctx) => {
        only(a, ['id', 'tags']);
        const id = uuid(a.id);
        if (!Array.isArray(a.tags) || a.tags.length > 12) throw bad();
        const tags = [...new Set(a.tags.map((t) => str(t, 40, { min: 1 })))];
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowJson(c, 'support_tickets', id);
          if (!before) throw new HttpError(404, 'That ticket no longer exists.');
          await c.query('update public.support_tickets set tags = $2::text[], updated_at = now() where id = $1', [id, tags]);
          const after = await rowJson(c, 'support_tickets', id);
          await audit({ action: 'ticket_set_tags', entity: 'support_tickets', entityId: id, detail: 'Changed ticket tags', before, after });
          return { ok: true, message: 'Tags saved.' };
        });
      },
    },
    // Delete to trash: the ticket and the replies and notes the delete cascades to.
    ticket_delete: {
      perm: 'support',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowJson(c, 'support_tickets', id);
          if (!before) throw new HttpError(404, 'That ticket no longer exists.');
          const responses = (await c.query('select to_jsonb(r) as r from public.support_responses r where ticket_id = $1', [id])).rows.map((x) => x.r);
          const notes = (await c.query('select to_jsonb(n) as r from public.support_notes n where ticket_id = $1', [id])).rows.map((x) => x.r);
          await toTrash(c, ctx.staff.userId, 'support_tickets', id, before, { support_responses: responses, support_notes: notes });
          await c.query('delete from public.support_tickets where id = $1', [id]);
          await audit({ action: 'ticket_delete', entity: 'support_tickets', entityId: id, detail: 'Deleted ticket (copied to trash)', before, after: null });
          return { ok: true, message: 'Ticket deleted. It is in the trash.' };
        });
      },
    },

    // ---------- Users ----------
    users_list: {
      perm: 'users_view',
      run: async (a, ctx) => {
        only(a, ['q', 'segment']);
        const q = str(a.q, 100, { optional: true }).toLowerCase();
        const seg = oneOf(a.segment, ['subscribed', 'trial', 'free', 'banned'] as const, { optional: true });
        // Searching by email is only possible with users_contact.
        const r = await pool.query(
          `select p.user_id as id, coalesce(p.full_name, '') as name, u.email, p.created_at, coalesce(p.review_count, 0) as reviews,
                  p.verified_reviewer, p.is_banned, s.plan, s.status as sub_status,
                  (select count(*) from public.dog_profiles d where d.user_id = p.user_id)::int as dogs,
                  (select count(*) from public.favorites f where f.user_id = p.user_id)::int as saves
             from public.profiles p left join auth.users u on u.id = p.user_id left join public.subscriptions s on s.user_id = p.user_id
            where ($1::text = '' or lower(coalesce(p.full_name, '')) like '%' || $1 || '%' or ($3::boolean and lower(coalesce(u.email, '')) like '%' || $1 || '%'))
              and case $2::text
                    when 'subscribed' then s.status = 'active'
                    when 'trial' then s.status = 'trial'
                    when 'free' then coalesce(s.status, '') not in ('active', 'trial')
                    when 'banned' then coalesce(p.is_banned, false)
                    else true end
            order by p.created_at desc limit 300`, [q.replace(/[%_\\]/g, (m) => '\\' + m), seg, can(ctx, 'users_contact')]);
        return { data: r.rows.map((x) => ({ ...x, email: contact(ctx, x.email) })) };
      },
    },
    user_detail: {
      perm: 'users_view',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        const p = (await pool.query(
          `select p.user_id as id, p.full_name, p.phone_number, p.location, p.created_at, p.review_count, p.verified_reviewer, p.is_banned, u.email,
                  s.plan, s.status as sub_status, s.trial_end,
                  (select count(*) from public.favorites f where f.user_id = p.user_id)::int as saves,
                  (select count(*) from public.session_analytics sa where sa.user_id = p.user_id)::int as sessions,
                  (select coalesce(sum(search_count), 0) from public.session_analytics sa where sa.user_id = p.user_id)::int as searches,
                  (select max(started_at) from public.session_analytics sa where sa.user_id = p.user_id) as last_active
             from public.profiles p left join auth.users u on u.id = p.user_id left join public.subscriptions s on s.user_id = p.user_id
            where p.user_id = $1`, [id])).rows[0];
        if (!p) throw new HttpError(404, 'That customer no longer exists.');
        const [dogs, favs, revs, tix, notifs, reports] = await Promise.all([
          pool.query('select name, breed, dob, temperament from public.dog_profiles where user_id = $1 order by created_at', [id]),
          pool.query('select l.name, f.created_at from public.favorites f left join public.locations l on l.id = f.location_id where f.user_id = $1 order by f.created_at desc limit 24', [id]),
          pool.query('select r.paw_rating, r.status, r.created_at, l.name as place from public.reviews r left join public.locations l on l.id = r.location_id where r.user_id = $1 order by r.created_at desc limit 50', [id]),
          p.email ? pool.query('select subject, status, created_at from public.support_tickets where lower(email) = lower($1) order by created_at desc limit 50', [p.email]) : { rows: [] },
          pool.query('select title, created_at, is_read from public.notifications where user_id = $1 order by created_at desc limit 30', [id]),
          pool.query("select reason, status, created_at from public.user_reports where reported_user_id = $1 order by created_at desc limit 20", [id]),
        ]);
        return {
          data: {
            profile: { ...p, email: contact(ctx, p.email), phone_number: contact(ctx, p.phone_number) },
            dogs: dogs.rows, saves: favs.rows, reviews: revs.rows, tickets: tix.rows, notifications: notifs.rows, reports: reports.rows,
            can_ban: can(ctx, 'users_ban'),
          },
        };
      },
    },
    user_ban: { perm: 'users_ban', run: async (a, ctx) => banOrUnban(pool, ctx, 'ban', a) },
    user_unban: { perm: 'users_ban', run: async (a, ctx) => banOrUnban(pool, ctx, 'unban', a) },
  };
}

// Ban and unban go through the existing admin-ban-user edge function (it keeps its own
// guard rails: no self-ban, no banning staff, admin only), called here on the server with
// the signed-in person's own token. The HQ audit row records the profile before and after.
async function banOrUnban(pool: Pool, ctx: Ctx, action: 'ban' | 'unban', a: Record<string, unknown>) {
  only(a, action === 'ban' ? ['id', 'reason'] : ['id']);
  const id = uuid(a.id);
  const reason = action === 'ban' ? str(a.reason, 500, { optional: true }) : '';
  return writeTx(pool, ctx.staff.userId, async (c, audit) => {
    const before = await rowJson(c, 'profiles', id, 'user_id');
    if (!before) throw new HttpError(404, 'That customer no longer exists.');
    const res = await fetch(SUPABASE_URL + '/functions/v1/admin-ban-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY, authorization: 'Bearer ' + ctx.token },
      body: JSON.stringify(reason ? { action, target_user_id: id, reason } : { action, target_user_id: id }),
    });
    const j: any = await res.json().catch(() => null);
    if (!j || j.error) {
      // The function's own refusal (for example banning a member of staff) is safe to show; nothing else is.
      throw new HttpError(res.status === 403 || res.status === 400 ? 400 : 502, j && typeof j.error === 'string' ? j.error.slice(0, 200) : 'The ban service did not respond.');
    }
    const after = await rowJson(c, 'profiles', id, 'user_id');
    await audit({ action: action === 'ban' ? 'user_ban' : 'user_unban', entity: 'profiles', entityId: id, detail: (action === 'ban' ? 'Banned customer' : 'Unbanned customer') + (reason ? ': ' + reason.slice(0, 120) : ''), before, after });
    return { ok: true, already: !!j.already, message: j.already ? (j.message || 'No change, the account was already in that state.') : action === 'ban' ? 'Customer banned.' : 'Customer unbanned.' };
  });
}
