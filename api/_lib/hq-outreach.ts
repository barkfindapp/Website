// Outreach (public.hq_outreach and hq_outreach_log): creators before they join, venues, press,
// partners and community. Fixed SQL only; these ops replace the outreach branches that used to
// live in public.hq_action (retired by the hq_outreach_v2 migration) and keep their names.
// Permissions: outreach_view reads, outreach_edit writes, outreach_delete removes (to hq_trash,
// with its log, so a restore brings the history back). Every write has an audit row with before
// and after. Draft a message with Claude stays in api/hq.ts (draft_outreach).
import type { Pool, PoolClient } from 'pg';
import { HttpError, bad, obj, only, uuid, str, oneOf, date, writeTx, toTrash } from './hq-core.js';
import type { Op } from './hq-act.js';

export const OUT_KINDS = ['creator', 'creator_prospect', 'venue', 'press', 'partner', 'community', 'other'] as const;
export const OUT_STATUSES = ['to_contact', 'contacted', 'replied', 'warm', 'agreed', 'live', 'shared', 'declined', 'parked'] as const;
const CHANNELS = ['email', 'instagram_dm', 'phone', 'in_person', 'other'] as const;
const HANDLE_KEYS = ['instagram', 'tiktok', 'facebook', 'youtube'] as const;
const PAGE = 50;
const IMPORT_CAP = 200;

// The views down the left of the tab. Follow up due counts anything dated today or earlier
// that is still in play (UK date).
const TODAY_UK = "(now() at time zone 'Europe/London')::date";
const VIEWS: Record<string, string> = {
  to_contact: "o.status = 'to_contact'",
  follow_up: `o.next_follow_up <= ${TODAY_UK} and o.status not in ('declined', 'parked')`,
  waiting: "o.status = 'contacted'",
  warm: "o.status in ('replied', 'warm', 'agreed')",
  shared: "o.status in ('shared', 'live')",
  declined: "o.status in ('declined', 'parked')",
  all: 'true',
};

const ROW_COLS = `o.id, o.name, o.org, o.kind, o.area, o.status, o.last_contact_at, o.next_action, o.next_follow_up::text as next_follow_up,
  o.tags, o.owner, o.location_id, o.creator_id, o.source, coalesce(s.display_name, s.email) as owner_name,
  l.name as place_name, l.category, l.barkfind_rating, l.review_count,
  exists (select 1 from public.location_reports r where r.location_id = o.location_id and r.status = 'open') as open_report`;
const FROM = `public.hq_outreach o left join public.locations l on l.id = o.location_id left join public.hq_staff s on s.user_id = o.owner`;

const rowOf = async (c: PoolClient | Pool, id: string) =>
  (await c.query('select to_jsonb(o) as r from public.hq_outreach o where o.id = $1', [id])).rows[0]?.r ?? null;

function tagList(v: unknown): string[] {
  if (v == null || v === '') return [];
  if (!Array.isArray(v) || v.length > 20) throw bad();
  const out = v.map((t) => str(t, 40, { min: 1 }).toLowerCase().replace(/\s+/g, ' '));
  return [...new Set(out)];
}
function handles(v: unknown): Record<string, string> {
  if (v == null || v === '') return {};
  const h = obj(v), out: Record<string, string> = {};
  for (const k of HANDLE_KEYS) if (k in h) { const s = str(h[k], 120, { optional: true }); if (s) out[k] = s; }
  return out;
}
const optUuid = (v: unknown) => (v === '' || v == null ? null : uuid(v));

// Import from places: one area (town name or postcode start, case-insensitive against the
// address), optionally one category and a minimum BarkFind rating. Hidden (flagged) places and
// places already linked to a contact are skipped.
function importFilter(a: Record<string, unknown>) {
  const area = str(a.area, 60, { min: 2 });
  const category = str(a.category, 40, { optional: true }) || null;
  const minRating = a.min_rating === '' || a.min_rating == null ? null : Number(a.min_rating);
  if (minRating !== null && (!Number.isFinite(minRating) || minRating < 0 || minRating > 5)) throw bad();
  const sql = `from public.locations l
    where not l.flagged and l.address ilike '%' || $1 || '%'
      and ($2::text is null or l.category = $2)
      and ($3::float8 is null or l.barkfind_rating >= $3)
      and not exists (select 1 from public.hq_outreach o where o.location_id = l.id)`;
  return { area, category, minRating, sql, params: [area.replace(/[%_\\]/g, (m) => '\\' + m), category, minRating] };
}

export function outreachOps(pool: Pool): Record<string, Op> {
  return {
    // The list for one view, filtered and paged, plus the counts per view and the filter options.
    outreach_list: {
      perm: 'outreach_view',
      run: async (a) => {
        only(a, ['view', 'kind', 'status', 'area', 'owner', 'tag', 'category', 'min_rating', 'q', 'page']);
        const view = (oneOf(a.view, Object.keys(VIEWS), { optional: true }) || 'to_contact') as string;
        const page = Number.isInteger(a.page) && (a.page as number) >= 0 && (a.page as number) < 1000 ? (a.page as number) : 0;
        const p: unknown[] = [], w: string[] = [VIEWS[view]];
        const add = (cond: string, v: unknown) => { p.push(v); w.push(cond.replace('?', '$' + p.length)); };
        const kind = oneOf(a.kind, OUT_KINDS, { optional: true }); if (kind) add('o.kind = ?', kind);
        const status = oneOf(a.status, OUT_STATUSES, { optional: true }); if (status) add('o.status = ?', status);
        const area = str(a.area, 60, { optional: true }); if (area) add('lower(o.area) = lower(?)', area);
        if (a.owner === 'none') w.push('o.owner is null'); else if (a.owner) add('o.owner = ?', uuid(a.owner));
        const tag = str(a.tag, 40, { optional: true }); if (tag) add('? = any(o.tags)', tag.toLowerCase());
        const category = str(a.category, 40, { optional: true }); if (category) add('l.category = ?', category);
        if (a.min_rating !== undefined && a.min_rating !== '') {
          const r = Number(a.min_rating); if (!Number.isFinite(r) || r < 0 || r > 5) throw bad();
          add('l.barkfind_rating >= ?', r);
        }
        const q = str(a.q, 80, { optional: true });
        if (q) { p.push(q.replace(/[%_\\]/g, (m) => '\\' + m)); const n = '$' + p.length; w.push(`(o.name ilike '%' || ${n} || '%' or o.org ilike '%' || ${n} || '%' or o.area ilike '%' || ${n} || '%')`); }
        const where = w.join(' and ');
        const order = view === 'follow_up' ? 'o.next_follow_up asc, o.name' : view === 'all' ? 'o.name' : 'o.next_follow_up asc nulls last, o.last_contact_at desc nulls last, o.name';
        const [rows, total, counts, opts] = await Promise.all([
          pool.query(`select ${ROW_COLS} from ${FROM} where ${where} order by ${order} limit ${PAGE} offset ${page * PAGE}`, p),
          pool.query(`select count(*)::int as n from ${FROM} where ${where}`, p),
          pool.query(`select ${Object.entries(VIEWS).map(([k, v]) => `count(*) filter (where ${v})::int as ${k}`).join(', ')} from public.hq_outreach o`),
          pool.query(`select
              (select coalesce(jsonb_agg(distinct o.area order by o.area), '[]') from public.hq_outreach o where coalesce(o.area, '') <> '') as areas,
              (select coalesce(jsonb_agg(distinct t order by t), '[]') from public.hq_outreach o, unnest(o.tags) t) as tags,
              (select coalesce(jsonb_agg(distinct l.category order by l.category), '[]') from public.hq_outreach o join public.locations l on l.id = o.location_id where l.category is not null) as categories,
              (select coalesce(jsonb_agg(jsonb_build_object('id', s.user_id, 'name', coalesce(s.display_name, s.email)) order by coalesce(s.display_name, s.email)), '[]') from public.hq_staff s where s.status = 'active') as owners`),
        ]);
        return { data: { view, rows: rows.rows, total: total.rows[0].n, page, page_size: PAGE, counts: counts.rows[0], options: opts.rows[0] } };
      },
    },

    // One contact with its full log (newest first) and, for a venue, the place.
    outreach_get: {
      perm: 'outreach_view',
      run: async (a) => {
        const id = uuid(only(a, ['id']).id);
        const o = (await pool.query(`select o.*, o.next_follow_up::text as next_follow_up, coalesce(s.display_name, s.email) as owner_name from public.hq_outreach o
                                       left join public.hq_staff s on s.user_id = o.owner where o.id = $1`, [id])).rows[0];
        if (!o) throw new HttpError(404, 'That contact no longer exists.');
        const [log, place] = await Promise.all([
          pool.query(`select g.id, g.at, g.note, g.channel, g.direction, g.body, coalesce(s.display_name, s.email) as by_name
                        from public.hq_outreach_log g left join public.hq_staff s on s.user_id = g."by" where g.outreach_id = $1 order by g.at desc`, [id]),
          o.location_id ? pool.query(`select l.id, l.name, l.category, l.address, l.barkfind_rating, l.review_count, l.image_url, l.website, l.flagged,
                                             (select count(*) from public.location_reports r where r.location_id = l.id and r.status = 'open')::int as open_reports
                                        from public.locations l where l.id = $1`, [o.location_id]) : Promise.resolve({ rows: [] as any[] }),
        ]);
        return { data: { contact: o, log: log.rows, place: place.rows[0] || null } };
      },
    },

    // Add (no id) or edit a contact. Only the fields sent are changed.
    outreach_save: {
      perm: 'outreach_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'name', 'org', 'kind', 'status', 'handle', 'handles', 'email', 'phone', 'area', 'owner', 'tags', 'location_id', 'creator_id',
          'next_follow_up', 'next_action', 'owed', 'notes']);
        const id = a.id === undefined || a.id === '' ? null : uuid(a.id);
        const f: Record<string, unknown> = {};
        if ('name' in a) f.name = str(a.name, 200, { min: 1 });
        if ('org' in a) f.org = str(a.org, 200, { optional: true }) || null;
        if ('kind' in a) f.kind = oneOf(a.kind, OUT_KINDS);
        if ('status' in a) f.status = oneOf(a.status, OUT_STATUSES);
        if ('handle' in a) f.handle = str(a.handle, 200, { optional: true }) || null;
        if ('handles' in a) f.handles = JSON.stringify(handles(a.handles));
        if ('email' in a) { const e = str(a.email, 200, { optional: true }); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new HttpError(400, 'Check the email address.'); f.email = e || null; }
        if ('phone' in a) f.phone = str(a.phone, 60, { optional: true }) || null;
        if ('area' in a) f.area = str(a.area, 60, { optional: true }) || null;
        if ('owner' in a) f.owner = optUuid(a.owner);
        if ('tags' in a) f.tags = tagList(a.tags);
        if ('location_id' in a) f.location_id = optUuid(a.location_id);
        if ('creator_id' in a) f.creator_id = optUuid(a.creator_id);
        if ('next_follow_up' in a) f.next_follow_up = date(a.next_follow_up, { optional: true }) || null;
        if ('next_action' in a) f.next_action = str(a.next_action, 500, { optional: true }) || null;
        if ('owed' in a) f.owed = str(a.owed, 500, { optional: true }) || null;
        if ('notes' in a) f.notes = str(a.notes, 5000, { optional: true }) || null;
        if (!id && !f.name) throw new HttpError(400, 'A name is needed.');
        const keys = Object.keys(f);
        if (id && !keys.length) throw new HttpError(409, 'Nothing has changed.');
        const cast = (k: string) => (k === 'handles' ? '::jsonb' : k === 'tags' ? '::text[]' : '');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = id ? await rowOf(c, id) : null;
          if (id && !before) throw new HttpError(404, 'That contact no longer exists.');
          let newId = id;
          try {
            if (id) {
              await c.query(`update public.hq_outreach set ${keys.map((k, i) => `${k} = $${i + 2}${cast(k)}`).join(', ')}, updated_at = now() where id = $1`, [id, ...keys.map((k) => f[k])]);
            } else {
              newId = (await c.query(`insert into public.hq_outreach (${keys.join(', ')}) values (${keys.map((k, i) => `$${i + 1}${cast(k)}`).join(', ')}) returning id`,
                keys.map((k) => f[k]))).rows[0].id;
            }
          } catch (e: any) {
            if (e?.code === '23505') throw new HttpError(409, 'That place already has an outreach contact.');
            if (e?.code === '23503') throw new HttpError(400, 'That place, creator or owner no longer exists.');
            throw e;
          }
          const after = await rowOf(c, newId!);
          await audit({ action: 'outreach_save', entity: 'hq_outreach', entityId: newId, detail: `${id ? 'Saved' : 'Added'} outreach contact ${after.name}`, before, after });
          return { ok: true, message: id ? 'Saved.' : 'Added.', id: newId };
        });
      },
    },

    // Log a contact: what happened, how and which way. Moves the status and follow-up if asked.
    outreach_log: {
      perm: 'outreach_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'note', 'channel', 'direction', 'status', 'next_follow_up']);
        const id = uuid(a.id);
        const note = str(a.note, 2000, { min: 1 });
        const channel = oneOf(a.channel, CHANNELS, { optional: true }) || null;
        const direction = oneOf(a.direction, ['out', 'in'] as const, { optional: true }) || null;
        const status = oneOf(a.status, OUT_STATUSES, { optional: true }) || null;
        const setFollow = 'next_follow_up' in a;
        const follow = setFollow ? date(a.next_follow_up, { optional: true }) || null : null;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowOf(c, id);
          if (!before) throw new HttpError(404, 'That contact no longer exists.');
          const entry = (await c.query(
            `insert into public.hq_outreach_log (outreach_id, note, channel, direction, "by") values ($1, $2, $3, $4, $5)
             returning id, at, note, channel, direction`, [id, note, channel, direction, ctx.staff.userId])).rows[0];
          await c.query(
            `update public.hq_outreach set last_contact_at = now(), status = coalesce($2, status),
                    next_follow_up = case when $3 then $4::date else next_follow_up end, updated_at = now() where id = $1`,
            [id, status, setFollow, follow]);
          const after = await rowOf(c, id);
          await audit({ action: 'outreach_log', entity: 'hq_outreach', entityId: id, detail: `Logged a contact with ${before.name}${channel ? ' (' + channel.replace('_', ' ') + ')' : ''}`,
            before, after: { ...after, log_entry: entry } });
          return { ok: true, message: 'Logged.' };
        });
      },
    },

    // Add or remove tags on many contacts at once (the page offers undo before it runs).
    outreach_tag: {
      perm: 'outreach_edit',
      run: async (a, ctx) => {
        only(a, ['ids', 'add', 'remove']);
        if (!Array.isArray(a.ids) || !a.ids.length || a.ids.length > 500) throw bad();
        const ids = [...new Set(a.ids.map((x) => uuid(x)))];
        const addT = tagList(a.add), remT = tagList(a.remove);
        if (!addT.length && !remT.length) throw new HttpError(400, 'Choose a tag to add or remove.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query('select id, name, tags from public.hq_outreach where id = any($1::uuid[]) order by name', [ids])).rows;
          if (!before.length) throw new HttpError(404, 'Those contacts no longer exist.');
          await c.query(
            `update public.hq_outreach set tags = (select coalesce(array_agg(distinct t order by t), '{}') from unnest(tags || $2::text[]) t where t <> all($3::text[])), updated_at = now()
              where id = any($1::uuid[])`, [ids, addT, remT]);
          const after = (await c.query('select id, name, tags from public.hq_outreach where id = any($1::uuid[]) order by name', [ids])).rows;
          await audit({ action: 'outreach_tag', entity: 'hq_outreach', entityId: null,
            detail: `Tags on ${before.length} contact${before.length === 1 ? '' : 's'}: ${addT.length ? 'added ' + addT.join(', ') : ''}${addT.length && remT.length ? '; ' : ''}${remT.length ? 'removed ' + remT.join(', ') : ''}`.slice(0, 300),
            before, after });
          return { ok: true, message: `Updated ${before.length} contact${before.length === 1 ? '' : 's'}.`, count: before.length };
        });
      },
    },

    // Delete: the contact and its whole log go to hq_trash (restorable from Admin, Trash).
    outreach_delete: {
      perm: 'outreach_delete',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await rowOf(c, id);
          if (!before) throw new HttpError(404, 'That contact no longer exists.');
          const log = (await c.query('select to_jsonb(g) as r from public.hq_outreach_log g where g.outreach_id = $1 order by g.at', [id])).rows.map((x) => x.r);
          await toTrash(c, ctx.staff.userId, 'hq_outreach', id, before, { hq_outreach_log: log });
          await c.query('delete from public.hq_outreach where id = $1', [id]);
          await audit({ action: 'outreach_delete', entity: 'hq_outreach', entityId: id, detail: `Deleted outreach contact ${before.name} (${log.length} log entr${log.length === 1 ? 'y' : 'ies'}) to the trash`, before: { ...before, log }, after: null });
          return { ok: true, message: 'Moved to the trash. Restore it from Admin, Trash.' };
        });
      },
    },

    // Import from places, step 1: how many would be added, and the first twenty.
    outreach_import_preview: {
      perm: 'outreach_edit',
      run: async (a) => {
        only(a, ['area', 'category', 'min_rating']);
        const f = importFilter(a);
        const [n, first] = await Promise.all([
          pool.query(`select count(*)::int as n ${f.sql}`, f.params),
          pool.query(`select l.name, l.category, l.barkfind_rating, l.address ${f.sql} order by l.barkfind_rating desc nulls last, l.review_count desc, l.name limit 20`, f.params),
        ]);
        return { data: { count: n.rows[0].n, will_import: Math.min(n.rows[0].n, IMPORT_CAP), cap: IMPORT_CAP, first: first.rows } };
      },
    },
    // Step 2 (second tap): create up to 200 venue rows, source import, skipping linked places.
    outreach_import: {
      perm: 'outreach_edit',
      run: async (a, ctx) => {
        only(a, ['area', 'category', 'min_rating']);
        const f = importFilter(a);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const ins = await c.query(
            `insert into public.hq_outreach (name, kind, status, area, location_id, source, owner)
             select l.name, 'venue', 'to_contact', $4, l.id, 'import', $5 ${f.sql}
              order by l.barkfind_rating desc nulls last, l.review_count desc, l.name limit ${IMPORT_CAP}
             on conflict (location_id) where location_id is not null do nothing
             returning id, location_id`, [...f.params, f.area, ctx.staff.userId]);
          const ids = ins.rows.map((r) => r.id);
          await audit({ action: 'outreach_import', entity: 'hq_outreach', entityId: null,
            detail: `Imported ${ids.length} venue${ids.length === 1 ? '' : 's'} from places: ${f.area}${f.category ? ', ' + f.category : ''}${f.minRating !== null ? ', rated ' + f.minRating + '+' : ''}`.slice(0, 300),
            before: null, after: { filter: { area: f.area, category: f.category, min_rating: f.minRating }, ids, location_ids: ins.rows.map((r) => r.location_id) } });
          return { ok: true, message: `Added ${ids.length} venue${ids.length === 1 ? '' : 's'} to To contact.`, count: ids.length };
        });
      },
    },
  };
}
