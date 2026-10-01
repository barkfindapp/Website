// Phase 3: Admin, Activity and Backlog (needs audit_view), read only.
// audit_list: admin_audit newest first, 50 a page, filtered by action, person, area (table)
//   and dates, with text search on the description. Rows from /admin (actor 'admin', or an
//   email "via Claude") are included and labelled. Before and after come from audit_get.
// backlog: /admin's Ops tiles (live places without a photo, without an AI summary, Google
//   data older than 30 days, audited actions in the last 24 hours) and places added per week.
import type { Pool } from 'pg';
import { HttpError, bad, only, uuid, str, date } from './hq-core.js';
import type { Op } from './hq-act.js';

const PAGE = 50;
const NAME_RE = /^[A-Za-z_]{1,60}$/;

export function auditOps(pool: Pool): Record<string, Op> {
  return {
    audit_list: {
      perm: 'audit_view',
      run: async (a) => {
        only(a, ['action', 'person', 'entity', 'from', 'to', 'q', 'page']);
        const action = str(a.action, 60, { optional: true }), entity = str(a.entity, 60, { optional: true });
        if ((action && !NAME_RE.test(action)) || (entity && !NAME_RE.test(entity))) throw bad();
        const person = str(a.person, 40, { optional: true });
        if (person && person !== 'admin' && person !== 'other') uuid(person);
        const from = date(a.from, { optional: true }), to = date(a.to, { optional: true });
        const q = str(a.q, 100, { optional: true });
        const page = Number.isInteger(a.page) && (a.page as number) >= 0 && (a.page as number) < 1000 ? a.page as number : 0;
        const w: string[] = [], p: unknown[] = [];
        const add = (sql: string, v: unknown) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
        if (action) add('a.action = ?', action);
        if (entity) add('a.entity = ?', entity);
        if (person === 'admin') w.push("a.actor = 'admin'");
        else if (person === 'other') w.push("a.actor not in ('hq', 'admin')");
        else if (person) add('a.actor_user_id = ?', person);
        if (from) add('a.created_at >= ?::date', from);
        if (to) add("a.created_at < (?::date + interval '1 day')", to);
        if (q) add("(a.detail ilike ? or a.entity_id ilike $Q)", '%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%');
        const where = (w.join(' and ') || 'true').replace(/\$Q/g, '$' + p.length);
        const [rows, total, opts] = await Promise.all([
          pool.query(
            `select a.id, a.created_at, a.actor, a.actor_user_id, a.action, a.entity, a.entity_id, left(a.detail, 300) as detail,
                    (a.before is not null) as has_before, (a.after is not null) as has_after,
                    coalesce(s.display_name, s.email) as person
               from public.admin_audit a left join public.hq_staff s on s.user_id = a.actor_user_id
              where ${where} order by a.created_at desc, a.id limit ${PAGE} offset ${page * PAGE}`, p),
          pool.query(`select count(*)::int as n from public.admin_audit a where ${where}`, p),
          pool.query(`select
              (select coalesce(jsonb_agg(x order by x), '[]') from (select distinct action as x from public.admin_audit where action is not null) d) as actions,
              (select coalesce(jsonb_agg(x order by x), '[]') from (select distinct entity as x from public.admin_audit where entity is not null) d) as entities,
              (select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', coalesce(s.display_name, s.email)) order by coalesce(s.display_name, s.email)), '[]')
                 from public.hq_staff s where exists (select 1 from public.admin_audit a where a.actor_user_id = s.user_id)) as people`),
        ]);
        return { data: { rows: rows.rows, total: total.rows[0].n, page, page_size: PAGE, options: opts.rows[0] } };
      },
    },

    audit_get: {
      perm: 'audit_view',
      run: async (a) => {
        const id = uuid(only(a, ['id']).id);
        const r = await pool.query(
          `select a.*, coalesce(s.display_name, s.email) as person from public.admin_audit a
             left join public.hq_staff s on s.user_id = a.actor_user_id where a.id = $1`, [id]);
        if (!r.rows[0]) throw new HttpError(404, 'That entry no longer exists.');
        return { data: r.rows[0] };
      },
    },

    backlog: {
      perm: 'audit_view',
      run: async (a) => {
        only(a, []);
        const [tiles, weeks] = await Promise.all([
          pool.query(`select
              (select count(*)::int from public.locations where not flagged and coalesce(image_url, '') = '') as no_photo,
              (select count(*)::int from public.locations where not flagged and coalesce(description, '') = '') as no_summary,
              (select count(*)::int from public.locations where not flagged and (extra_data->>'google_last_synced') is not null
                 and (extra_data->>'google_last_synced')::timestamptz < now() - interval '30 days') as google_stale,
              (select count(*)::int from public.locations where not flagged) as live,
              (select count(*)::int from public.admin_audit where created_at >= now() - interval '1 day') as actions_24h`),
          pool.query(`select to_char(w.wk, 'YYYY-MM-DD') as week,
              (select count(*)::int from public.locations l where l.created_at >= w.wk and l.created_at < w.wk + interval '1 week') as n
            from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as w(wk) order by w.wk`),
        ]);
        return { data: { tiles: tiles.rows[0], places_per_week: weeks.rows } };
      },
    },
  };
}
