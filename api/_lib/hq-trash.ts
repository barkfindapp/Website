// Phase 3: Admin, Trash (needs trash_restore). Lists what HQ deleted or merged away, and
// restores an item in one audited transaction using the shared plans in hq-trash-plans.ts
// (the same SQL the rolled-back tests run). There is no "delete forever" here; how long trash
// is kept is decided in the database (see the notes in the hq-trash report).
import type { Pool } from 'pg';
import { HttpError, only, uuid, oneOf, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';
import { planFor, RESTORABLE, TABLES, COLS_SQL, markRestored, type Cols } from './hq-trash-plans.js';

const PAGE = 50;
const KIND: Record<string, string> = {
  locations: 'Place', support_tickets: 'Support ticket', content_pieces: 'Content piece', hq_outreach: 'Outreach contact', notifications: 'Announcement',
};

// "3 reviews, 1 favourite, place ID blocked": what is stored with an item, for the list.
function storedWith(entity: string, related: any): string[] {
  if (!related || typeof related !== 'object') return [];
  const count = (o: any) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(o || {})) if (Array.isArray(v) && v.length) out[k] = v.length;
    return out;
  };
  const names: Record<string, [string, string]> = {
    reviews: ['review', 'reviews'], rating_signals: ['rating signal', 'rating signals'], review_rating_signals: ['review rating signal', 'review rating signals'],
    favorites: ['favourite', 'favourites'], location_reports: ['report', 'reports'], business_claims: ['claim', 'claims'],
    location_restrictions: ['restriction', 'restrictions'], dog_policy_reviews: ['dog policy check', 'dog policy checks'], listing_change_requests: ['listing change', 'listing changes'],
    moderation_log: ['moderation entry', 'moderation entries'], review_likes: ['review like', 'review likes'], mylo_backfill_queue: ['summary queue entry', 'summary queue entries'],
    geograph_requeue: ['photo queue entry', 'photo queue entries'], notification_links: ['notification link', 'notification links'], support_responses: ['reply', 'replies'],
    support_notes: ['note', 'notes'], notifications: ['person', 'people'], user_reports_unlinked: ['report link', 'report links'],
  };
  const say = (o: Record<string, number>) => Object.entries(o).map(([k, n]) => `${n} ${(names[k] || [k.replace(/_/g, ' '), k.replace(/_/g, ' ')])[n === 1 ? 0 : 1]}`);
  if (entity === 'locations' && related.merged_into) {
    const out: string[] = [];
    const moved = say(count(related.moved)); if (moved.length) out.push('moved to the kept place: ' + moved.join(', '));
    const removed = say(count(related.removed)); if (removed.length) out.push('removed as duplicates: ' + removed.join(', '));
    if (Array.isArray(related.place_id_blocklist) && related.place_id_blocklist.length) out.push('Google place ID blocked');
    return out;
  }
  const { place_id_blocklist, ...rest } = related;
  const out = say(count(rest));
  if (Array.isArray(place_id_blocklist) && place_id_blocklist.length) out.push('Google place ID blocked');
  return out;
}

export function trashOps(pool: Pool): Record<string, Op> {
  return {
    trash_list: {
      perm: 'trash_restore',
      run: async (a) => {
        only(a, ['show', 'page']);
        const show = (oneOf(a.show, ['waiting', 'restored', 'all'] as const, { optional: true }) || 'waiting') as string;
        const page = Number.isInteger(a.page) && (a.page as number) >= 0 && (a.page as number) < 1000 ? a.page as number : 0;
        const where = show === 'waiting' ? 't.restored_at is null' : show === 'restored' ? 't.restored_at is not null' : 'true';
        const [rows, total] = await Promise.all([
          pool.query(
            `select t.id, t.entity, t.entity_id, t.deleted_at, t.restored_at,
                    coalesce(t.row_data->>'name', t.row_data->>'title', t.row_data->>'subject', t.entity_id) as name,
                    t.row_data->>'category' as category, t.row_data->>'address' as address, t.row_data->>'email' as email,
                    t.related, coalesce(d.display_name, d.email) as deleted_by_name, coalesce(r.display_name, r.email) as restored_by_name,
                    (select l.name from public.locations l where l.id = (t.related->>'merged_into')::uuid) as merged_into_name,
                    floor(extract(epoch from now() - t.deleted_at) / 86400)::int as age_days
               from public.hq_trash t
               left join public.hq_staff d on d.user_id = t.deleted_by left join public.hq_staff r on r.user_id = t.restored_by
              where ${where} order by t.deleted_at desc, t.id limit ${PAGE} offset ${page * PAGE}`),
          pool.query(`select count(*)::int as n from public.hq_trash t where ${where}`),
        ]);
        return { data: {
          rows: rows.rows.map(({ related, email, ...x }) => ({
            ...x, kind: x.entity === 'locations' && related?.merged_into ? 'Merged copy' : KIND[x.entity] || x.entity.replace(/_/g, ' '),
            restorable: RESTORABLE.includes(x.entity), stored_with: storedWith(x.entity, related),
          })),
          total: total.rows[0].n, page, page_size: PAGE,
        } };
      },
    },

    trash_restore: {
      perm: 'trash_restore',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const t = (await c.query('select id, entity, entity_id, row_data, related, restored_at from public.hq_trash where id = $1 for update', [id])).rows[0];
          if (!t) throw new HttpError(404, 'That item is no longer in the trash.');
          if (!RESTORABLE.includes(t.entity)) throw new HttpError(409, 'Restore is not available for this kind of item.');
          const cols: Cols = Object.fromEntries((await c.query(COLS_SQL, [TABLES])).rows.map((r) => [r.table_name, r.cols]));
          const plan = planFor(t.entity, cols)!;
          // No triggers for the rest of this transaction only (see hq-trash-plans.ts). It has to be
          // a plain SET LOCAL statement: Supabase allows that for postgres but not set_config().
          await c.query('set local session_replication_role = replica');
          for (const s of plan.checks) {
            const problem = (await c.query(s.sql, [id])).rows[0];
            const msg = problem && Object.values(problem)[0];
            if (msg) throw new HttpError(409, String(msg) + ' Nothing was restored.');
          }
          const counts: Record<string, number> = {};
          for (const s of [...plan.steps, ...plan.after]) counts[s.label] = (await c.query(s.sql, [id])).rowCount || 0;
          await c.query(markRestored, [id, ctx.staff.userId]);
          const result = (await c.query(plan.verify, [id])).rows[0]?.jsonb_build_object ?? null;
          const name = String(t.row_data?.name || t.row_data?.title || t.row_data?.subject || t.entity_id).slice(0, 80);
          const done = Object.entries(counts).filter(([k, n]) => n && !/cleared|rating|counts/.test(k)).map(([k, n]) => `${k} ${n}`);
          await audit({ action: 'trash_restore', entity: t.entity, entityId: t.entity_id,
            detail: `Restored ${KIND[t.entity] || t.entity} "${name}" from the trash${t.related?.merged_into ? ' (undid a merge)' : ''}: ${done.join(', ')}`.slice(0, 300),
            before: null, after: { trash_id: id, counts, result } });
          return { ok: true, message: `Restored "${name}".${t.related?.merged_into ? ' The merge is undone: the rows that moved to the kept place are back on it.' : ''}`, counts, result };
        });
      },
    },
  };
}
