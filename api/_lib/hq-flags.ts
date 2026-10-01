// Phase 1c Part A: the flagged places queue (To review, Kept excluded, Restored).
// Everything runs on the server over the full set, with paging. A selection is either
// ticked ids or "all matching this filter", resolved here in one transaction. Each bulk
// action writes one admin_audit row with the filter and every id (and each place's
// previous state), so a batch can be reversed later. Restoring sets the category with the
// category lock (category_locked, category_set_at, category_set_by in the same update).
import type { Pool, PoolClient } from 'pg';
import { HttpError, bad, only, uuid, str, oneOf, date, bool, writeTx, toTrash } from './hq-core.js';
import type { Op, Ctx } from './hq-act.js';

export const CATEGORIES = ['park', 'cafe', 'pub', 'bar', 'restaurant', 'beach', 'pet-store', 'vet', 'groomer'] as const;
const TABS = ['to_review', 'keep_excluded', 'restored', 'all'] as const;
const RULES = ['hard_reject', 'soft_reject', 'dogs_not_allowed', 'manual', 'report'] as const;
const SORTS = { new: 'l.flagged_at desc nulls last, l.name', old: 'l.flagged_at asc nulls last, l.name', name: 'l.name, l.id' } as const;
const PAGE = 50;
const MAX_BULK = 5000;
const GTYPE_RE = /^[a-z0-9_]{1,60}$/;

type Filter = { tab: typeof TABS[number]; rule: string; gtype: string; category: string; by: string; from: string; to: string; q: string };

function readFilter(v: unknown): Filter {
  const f = (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
  only(f, ['tab', 'rule', 'gtype', 'category', 'by', 'from', 'to', 'q']);
  const gtype = str(f.gtype, 60, { optional: true });
  if (gtype && gtype !== '(none)' && !GTYPE_RE.test(gtype)) throw bad();
  const by = str(f.by, 40, { optional: true });
  if (by && by !== 'auto') uuid(by);
  return {
    tab: (oneOf(f.tab, TABS, { optional: true }) || 'to_review') as Filter['tab'],
    rule: oneOf(f.rule, RULES, { optional: true }), gtype,
    category: oneOf(f.category, CATEGORIES, { optional: true }), by,
    from: date(f.from, { optional: true }), to: date(f.to, { optional: true }),
    q: str(f.q, 100, { optional: true }).toLowerCase(),
  };
}

// WHERE clause and parameters for a filter. Only fixed SQL fragments; values are bound.
function where(f: Filter, skip: Partial<Record<'tab' | 'rule' | 'gtype' | 'category', boolean>> = {}) {
  const w: string[] = [], p: unknown[] = [];
  const add = (sql: string, v?: unknown) => { if (v !== undefined) { p.push(v); w.push(sql.replace('?', '$' + p.length)); } else w.push(sql); };
  if (!skip.tab) {
    if (f.tab === 'to_review') add("l.flagged and l.flag_review = 'to_review'");
    else if (f.tab === 'keep_excluded') add("l.flagged and l.flag_review = 'keep_excluded'");
    else if (f.tab === 'restored') add("not l.flagged and l.flag_review = 'restored'");
    else add('l.flag_review is not null');
  } else add('l.flag_review is not null');
  if (f.rule && !skip.rule) add('l.flag_rule = ?', f.rule);
  if (f.gtype && !skip.gtype) { if (f.gtype === '(none)') add('l.flag_google_type is null'); else add('l.flag_google_type = ?', f.gtype); }
  if (f.category && !skip.category) add('l.category = ?', f.category);
  if (f.by === 'auto') add('l.flagged_by is null');
  else if (f.by) add('l.flagged_by = ?', f.by);
  if (f.from) add('l.flagged_at >= ?::date', f.from);
  if (f.to) add("l.flagged_at < (?::date + interval '1 day')", f.to);
  if (f.q) add("(lower(l.name) like ? or lower(coalesce(l.address, '')) like $Q or lower(coalesce(l.flag_reason, '')) like $Q)", '%' + f.q.replace(/[%_\\]/g, (m) => '\\' + m) + '%');
  const sql = w.join(' and ').replace(/\$Q/g, '$' + p.length);
  return { sql: sql || 'true', params: p };
}

// A selection: ticked ids, or every place matching a filter (capped).
type Selection = { ids: string[]; filter: Filter | null };
function readSelection(a: Record<string, unknown>): Selection {
  if (a.all === true) return { ids: [], filter: readFilter(a.filter) };
  if (!Array.isArray(a.ids) || a.ids.length < 1 || a.ids.length > 500) throw bad();
  return { ids: [...new Set(a.ids.map(uuid))], filter: null };
}
async function resolveIds(c: PoolClient | Pool, sel: Selection, extra: string) {
  if (sel.filter) {
    const w = where(sel.filter);
    const r = await c.query(`select l.id from public.locations l where ${w.sql} and ${extra} order by l.id limit ${MAX_BULK + 1}`, w.params);
    if (r.rows.length > MAX_BULK) throw new HttpError(400, `That is more than ${MAX_BULK} places. Narrow the filter first.`);
    return r.rows.map((x) => x.id as string);
  }
  const r = await c.query(`select l.id from public.locations l where l.id = any($1::uuid[]) and ${extra}`, [sel.ids]);
  return r.rows.map((x) => x.id as string);
}
const filterLabel = (f: Filter | null) => (f ? Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') : 'ticked places');

export function flagOps(pool: Pool): Record<string, Op> {
  return {
    // Counts for the tabs and filters. Tab totals follow the other filters; each facet
    // follows every filter except itself, so its numbers show what choosing it would give.
    flags_counts: {
      perm: 'places_moderate',
      run: async (a) => {
        const f = readFilter(only(a, ['filter']).filter);
        const tabs = where(f, { tab: true });
        const rule = where(f, { rule: true }), gt = where(f, { gtype: true }), cat = where(f, { category: true });
        const [t, r, g, c, by] = await Promise.all([
          pool.query(`select count(*) filter (where l.flagged and l.flag_review = 'to_review')::int as to_review,
                             count(*) filter (where l.flagged and l.flag_review = 'keep_excluded')::int as keep_excluded,
                             count(*) filter (where not l.flagged and l.flag_review = 'restored')::int as restored
                        from public.locations l where ${tabs.sql}`, tabs.params),
          pool.query(`select l.flag_rule as k, count(*)::int n from public.locations l where ${rule.sql} group by 1 order by 2 desc`, rule.params),
          pool.query(`select coalesce(l.flag_google_type, '(none)') as k, count(*)::int n from public.locations l where ${gt.sql} group by 1 order by 2 desc, 1 limit 300`, gt.params),
          pool.query(`select l.category as k, count(*)::int n from public.locations l where ${cat.sql} group by 1 order by 2 desc`, cat.params),
          pool.query(`select l.flagged_by as id, coalesce(s.display_name, s.email, 'Someone') as name, count(*)::int n
                        from public.locations l left join public.hq_staff s on s.user_id = l.flagged_by
                       where l.flag_review is not null and l.flagged_by is not null group by 1, 2 order by 3 desc limit 50`),
        ]);
        return { data: { tabs: t.rows[0], rules: r.rows, gtypes: g.rows, categories: c.rows, flaggers: by.rows, all_categories: CATEGORIES } };
      },
    },
    flags_list: {
      perm: 'places_moderate',
      run: async (a) => {
        only(a, ['filter', 'page', 'sort']);
        const f = readFilter(a.filter);
        const page = Number.isInteger(a.page) && (a.page as number) >= 0 && (a.page as number) < 10000 ? a.page as number : 0;
        const sort = SORTS[(oneOf(a.sort, Object.keys(SORTS) as (keyof typeof SORTS)[], { optional: true }) || 'new') as keyof typeof SORTS];
        const w = where(f);
        const [rows, total] = await Promise.all([
          pool.query(
            `select l.id, l.name, l.category, coalesce(left(l.address, 90), '') as address, l.flagged, l.flag_rule, l.flag_google_type, l.flag_review,
                    l.flag_reason, l.flagged_at, l.place_id, l.latitude, l.longitude, l.category_locked, l.category_set_at,
                    coalesce(s.display_name, s.email) as flagged_by_name
               from public.locations l left join public.hq_staff s on s.user_id = l.flagged_by
              where ${w.sql} order by ${sort} limit ${PAGE} offset ${page * PAGE}`, w.params),
          pool.query(`select count(*)::int n from public.locations l where ${w.sql}`, w.params),
        ]);
        return { data: { rows: rows.rows, total: total.rows[0].n, page, page_size: PAGE } };
      },
    },
    // Before the second tap on a big action: the exact count and the first few names.
    flags_preview: {
      perm: 'places_moderate',
      run: async (a) => {
        only(a, ['ids', 'all', 'filter', 'action']);
        const action = oneOf(a.action, ['keep', 'to_review', 'restore', 'delete'] as const) as 'keep' | 'to_review' | 'restore' | 'delete';
        const sel = readSelection(a);
        const ids = await resolveIds(pool, sel, eligible(action));
        const names = ids.length ? (await pool.query('select name from public.locations where id = any($1::uuid[]) order by name limit 5', [ids.slice(0, 500)])).rows.map((x) => x.name) : [];
        return { data: { count: ids.length, names } };
      },
    },
    flags_keep: { perm: 'places_moderate', run: async (a, ctx) => move(pool, ctx, a, 'keep') },
    flags_to_review: { perm: 'places_moderate', run: async (a, ctx) => move(pool, ctx, a, 'to_review') },
    flags_restore: {
      perm: 'places_moderate',
      run: async (a, ctx) => {
        only(a, ['ids', 'all', 'filter', 'category']);
        const category = oneOf(a.category, CATEGORIES) as string;
        const sel = readSelection(a);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const ids = await resolveIds(c, sel, eligible('restore'));
          if (!ids.length) throw new HttpError(409, 'Nothing in that selection can be restored.');
          const before = (await c.query('select id, category, flag_review, flagged_at, category_locked from public.locations where id = any($1::uuid[])', [ids])).rows;
          // Unflag and set the category with the lock, in one update (see the category_locked column comment).
          await c.query(
            `update public.locations set flagged = false, flagged_at = null, category = $2,
                    category_locked = true, category_set_at = now(), category_set_by = $3
              where id = any($1::uuid[])`, [ids, category, ctx.staff.userId]);
          await audit({ action: 'flags_restore', entity: 'locations', entityId: ids.length === 1 ? ids[0] : null,
            detail: `Restored ${ids.length} place${ids.length === 1 ? '' : 's'} as ${category} (${filterLabel(sel.filter)})`.slice(0, 300),
            before: { filter: sel.filter, places: before }, after: { ids, category, flagged: false, flag_review: 'restored', category_locked: true } });
          return { ok: true, message: `Restored ${ids.length} place${ids.length === 1 ? '' : 's'} as ${category}.`, count: ids.length };
        });
      },
    },
    // Delete: Kept excluded only. The place and every row the delete cascades to go into hq_trash.
    flags_delete: {
      perm: 'places_delete',
      run: async (a, ctx) => {
        only(a, ['ids', 'all', 'filter']);
        const sel = readSelection(a);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const ids = await resolveIds(c, sel, eligible('delete'));
          if (!ids.length) throw new HttpError(409, 'Only places in Kept excluded can be deleted.');
          // Their Google place IDs go on the blocklist so the scanners do not add them again;
          // the rows added are kept with each place in the trash so a restore can lift them.
          const blocked = (await c.query(
            `insert into public.location_place_id_blocklist (place_id, reason, kept_location_id, created_by)
             select l.place_id, 'deleted', null, $2 from public.locations l where l.id = any($1::uuid[]) and l.place_id is not null
             on conflict (place_id) do nothing returning place_id`, [ids, ctx.staff.userId])).rows.map((x) => x.place_id);
          await c.query(
            `insert into public.hq_trash (entity, entity_id, row_data, related, deleted_by)
             select 'locations', l.id::text, to_jsonb(l), jsonb_build_object(
                 'reviews', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reviews r where r.location_id = l.id),
                 'review_rating_signals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rating_signals x where x.review_id in (select id from public.reviews where location_id = l.id)),
                 'moderation_log', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.moderation_log x where x.review_id in (select id from public.reviews where location_id = l.id)),
                 'review_likes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.review_likes x where x.review_id in (select id from public.reviews where location_id = l.id)),
                 'user_reports_unlinked', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'review_id', x.review_id)), '[]') from public.user_reports x where x.review_id in (select id from public.reviews where location_id = l.id)),
                 'rating_signals', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.rating_signals x where x.location_id = l.id),
                 'favorites', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.favorites x where x.location_id = l.id),
                 'business_claims', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.business_claims x where x.location_id = l.id),
                 'location_reports', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.location_reports x where x.location_id = l.id),
                 'location_restrictions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.location_restrictions x where x.location_id = l.id),
                 'dog_policy_reviews', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.dog_policy_reviews x where x.location_id = l.id),
                 'mylo_backfill_queue', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.mylo_backfill_queue x where x.location_id = l.id),
                 'geograph_requeue', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.geograph_requeue x where x.location_id = l.id),
                 'place_id_blocklist', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.location_place_id_blocklist b where b.place_id = l.place_id and b.place_id = any($3::text[]))),
               $2
               from public.locations l where l.id = any($1::uuid[])`, [ids, ctx.staff.userId, blocked]);
          await c.query('delete from public.locations where id = any($1::uuid[])', [ids]);
          await audit({ action: 'flags_delete', entity: 'locations', entityId: ids.length === 1 ? ids[0] : null,
            detail: `Deleted ${ids.length} kept-excluded place${ids.length === 1 ? '' : 's'} to trash (${filterLabel(sel.filter)})`.slice(0, 300),
            before: { filter: sel.filter, ids }, after: { place_ids_blocked: blocked.length } });
          return { ok: true, message: `Deleted ${ids.length} place${ids.length === 1 ? '' : 's'}. They are in the trash.`, count: ids.length };
        });
      },
    },
  };
}

// Which places each action may touch.
function eligible(action: 'keep' | 'to_review' | 'restore' | 'delete') {
  return {
    keep: "l.flagged and l.flag_review = 'to_review'",
    to_review: "l.flagged and l.flag_review = 'keep_excluded'",
    restore: 'l.flagged',
    delete: "l.flagged and l.flag_review = 'keep_excluded'",
  }[action];
}

// To review <-> Kept excluded: a plain, audited update of flag_review. Nothing changes in the app.
async function move(pool: Pool, ctx: Ctx, a: Record<string, unknown>, to: 'keep' | 'to_review') {
  only(a, ['ids', 'all', 'filter']);
  const sel = readSelection(a);
  const value = to === 'keep' ? 'keep_excluded' : 'to_review';
  return writeTx(pool, ctx.staff.userId, async (c, audit) => {
    const ids = await resolveIds(c, sel, eligible(to));
    if (!ids.length) throw new HttpError(409, 'Nothing in that selection can be moved.');
    await c.query('update public.locations set flag_review = $2 where id = any($1::uuid[])', [ids, value]);
    const label = to === 'keep' ? 'Kept excluded' : 'Moved back to review';
    await audit({ action: to === 'keep' ? 'flags_keep' : 'flags_to_review', entity: 'locations', entityId: ids.length === 1 ? ids[0] : null,
      detail: `${label}: ${ids.length} place${ids.length === 1 ? '' : 's'} (${filterLabel(sel.filter)})`.slice(0, 300),
      before: { filter: sel.filter, ids, flag_review: to === 'keep' ? 'to_review' : 'keep_excluded' }, after: { ids, flag_review: value } });
    return { ok: true, message: `${label}: ${ids.length} place${ids.length === 1 ? '' : 's'}.`, count: ids.length };
  });
}
