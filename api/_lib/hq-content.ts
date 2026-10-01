// Phase 2: the Content engine. HQ owns the content_pieces queue and the New post form
// (news and events), under the rules in docs/content-contract.md:
// - Statuses are exactly draft, needs_edit, approved, exported. "Reject" sets needs_edit.
// - website_blog pieces that are approved or exported are published by the website build,
//   so approving one means it goes live on the next deploy of main.
// - Exported is always a person's step, with an optional link.
// - Generation starts in the database: select public.notify_content_generate(type, body),
//   which posts to generate-content with the content_trigger secret (never seen here).
//   HQ then reads content_runs; a run with no finished_at after 10 minutes is failed.
// Every write runs in writeTx with its admin_audit row; delete copies the row to hq_trash.
import type { Pool, PoolClient } from 'pg';
import { HttpError, bad, only, uuid, str, oneOf, date, bool, writeTx, toTrash } from './hq-core.js';
import type { Op, Ctx } from './hq-act.js';

const STATUSES = ['draft', 'needs_edit', 'approved', 'exported'] as const;
const GENERATE = ['release_notes', 'restriction_spotlight', 'location_page'] as const;
const NEW_TYPES = ['news', 'event'] as const;
const RUN_TIMEOUT_MIN = 10;
// The same numbers generate-content uses for area pages (read-only here, for the preview).
const AREA_FLOOR = 20, AREA_MIN_VENUES = 5, AREA_BATCH = 5;
const MAX_BODY = 100000, MAX_DIFF = 60000;
const HTTPS_RE = /^https:\/\/[^\s<>"]+$/i;

const COLS = `id, channel, content_type, source_type, source_ref, title, status, ai_generated,
  published_url, meta, created_at, updated_at, approved_at, approved_by`;

function https(v: unknown, { optional = false } = {}): string {
  const s = str(v, 2000, { optional });
  if (s && !HTTPS_RE.test(s)) throw bad();
  return s;
}

async function rowFor(c: PoolClient | Pool, id: string) {
  const r = await c.query(`select ${COLS}, body_md from public.content_pieces where id = $1`, [id]);
  return r.rows[0] || null;
}
async function lockRow(c: PoolClient, id: string) {
  const r = await c.query(`select ${COLS}, body_md from public.content_pieces where id = $1 for update`, [id]);
  if (!r.rows[0]) throw new HttpError(404, 'That piece is no longer there. Refresh the list.');
  return r.rows[0];
}
// A short audit snapshot: everything except the long body, plus its length.
const snap = (r: any) => r && ({ ...r, body_md: undefined, body_chars: typeof r.body_md === 'string' ? r.body_md.length : null });
const website = (r: any) => r.channel === 'website_blog';
const label = (r: any) => `"${String(r.title || '(untitled)').slice(0, 80)}" (${r.channel}, ${r.content_type})`;

// News and event fields, shared by New post and Save. Same rules as the website build reads.
function readMeta(type: string, a: Record<string, unknown>, prior: Record<string, unknown> = {}) {
  const meta: Record<string, unknown> = { ...prior };
  if (type === 'event') {
    const d = date(a.event_date);
    meta.event_date = d;
    meta.source_url = https(a.source_url);
    const town = str(a.town, 80, { optional: true }), venue = str(a.venue_name, 120, { optional: true });
    if (town) meta.town = town; else delete meta.town;
    if (venue) meta.venue_name = venue; else delete meta.venue_name;
  } else if (type === 'news') {
    const pd = date(a.published_date, { optional: true });
    if (pd) meta.published_date = pd; else delete meta.published_date;
    if (bool(a.press_release, { optional: true })) meta.press_release = true; else delete meta.press_release;
  }
  return meta;
}
const META_KEYS = ['event_date', 'source_url', 'town', 'venue_name', 'published_date', 'press_release'];

// A run's state for the page: running, done, refused (error_detail), failed (errors or 10 minutes).
const RUN_STATE = `case
    when r.finished_at is null and r.started_at < now() - interval '${RUN_TIMEOUT_MIN} minutes' then 'failed'
    when r.finished_at is null then 'running'
    when r.error_detail is not null and r.pieces_created = 0 then 'refused'
    when r.pieces_failed > 0 then 'partial'
    else 'done' end`;

export function contentOps(pool: Pool): Record<string, Op> {
  return {
    content_list: {
      perm: 'content',
      run: async (a) => {
        only(a, []);
        const [rows, counts] = await Promise.all([
          pool.query(`select ${COLS}, length(body_md) as body_chars from public.content_pieces order by created_at desc limit 300`),
          pool.query(`select status, count(*)::int as n,
                             count(*) filter (where channel = 'website_blog')::int as website
                        from public.content_pieces group by status`),
        ]);
        const c: Record<string, number> = { draft: 0, needs_edit: 0, approved: 0, exported: 0 };
        let live = 0;
        for (const r of counts.rows) { c[r.status] = r.n; if (r.status === 'approved' || r.status === 'exported') live += r.website; }
        return { data: { rows: rows.rows, counts: c, on_website: live } };
      },
    },

    content_get: {
      perm: 'content',
      run: async (a) => {
        const id = uuid(only(a, ['id']).id);
        const r = await pool.query(
          `select p.${COLS.replace(/,\s*/g, ', p.')}, p.body_md, coalesce(s.display_name, pr.full_name) as approved_by_name
             from public.content_pieces p
             left join public.hq_staff s on s.user_id = p.approved_by
             left join public.profiles pr on pr.user_id = p.approved_by
            where p.id = $1`, [id]);
        if (!r.rows[0]) throw new HttpError(404, 'That piece is no longer there. Refresh the list.');
        return { data: r.rows[0] };
      },
    },

    // Approve, or Reject (needs edit). Approving sets approved_at and approved_by.
    content_set_status: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, ['id', 'status']);
        const id = uuid(a.id), status = oneOf(a.status, ['approved', 'needs_edit'] as const);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockRow(c, id);
          if (before.status === status) throw new HttpError(409, status === 'approved' ? 'It is already approved.' : 'It is already marked needs edit.');
          if (status === 'approved' && before.status === 'exported') throw new HttpError(409, 'It is already exported.');
          if (status === 'approved' && !String(before.body_md || '').trim()) throw new HttpError(409, 'It has no text yet. Add some before approving.');
          if (status === 'approved') {
            await c.query("update public.content_pieces set status = 'approved', approved_at = now(), approved_by = $2, updated_at = now() where id = $1", [id, ctx.staff.userId]);
          } else {
            await c.query("update public.content_pieces set status = 'needs_edit', updated_at = now() where id = $1", [id]);
          }
          const after = await rowFor(c, id);
          const web = website(before);
          await audit({ action: 'content_set_status', entity: 'content_pieces', entityId: id,
            detail: (status === 'approved' ? 'Approved ' : 'Rejected (needs edit) ') + label(before) +
              (web ? (status === 'approved' ? ', goes live on the next website deploy' : ((before.status === 'approved' || before.status === 'exported') ? ', leaves the website on the next deploy' : '')) : ''),
            before: snap(before), after: snap(after) });
          const message = status === 'approved'
            ? (web ? 'Approved. It goes live on the next website deploy.' : 'Approved.')
            : (web && (before.status === 'approved' || before.status === 'exported') ? 'Moved to needs edit. It leaves the website on the next deploy.' : 'Moved to needs edit.');
          return { ok: true, message };
        });
      },
    },

    // Edit title and text, and the news or event fields for those types.
    content_save: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, ['id', 'title', 'body_md', ...META_KEYS]);
        const id = uuid(a.id), title = str(a.title, 300, { min: 1 }), body = str(a.body_md, MAX_BODY, { min: 1 });
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockRow(c, id);
          const hasMeta = META_KEYS.some((k) => a[k] !== undefined);
          if (hasMeta && !(NEW_TYPES as readonly string[]).includes(before.content_type)) throw bad();
          const meta = hasMeta ? readMeta(before.content_type, a, before.meta || {}) : before.meta;
          await c.query('update public.content_pieces set title = $2, body_md = $3, meta = $4::jsonb, updated_at = now() where id = $1',
            [id, title, body, JSON.stringify(meta || {})]);
          const after = await rowFor(c, id);
          const changed = { title: before.title !== title, body: before.body_md !== body, fields: JSON.stringify(before.meta) !== JSON.stringify(meta) };
          await audit({ action: 'content_save', entity: 'content_pieces', entityId: id,
            detail: `Edited ${label(after)}: ${Object.entries(changed).filter(([, v]) => v).map(([k]) => k).join(', ') || 'no change'}`,
            before: { ...snap(before), body_md: before.body_md }, after: { ...snap(after), body_md: after.body_md } });
          const live = website(before) && (before.status === 'approved' || before.status === 'exported');
          return { ok: true, message: live ? 'Saved. The website shows this version after the next deploy.' : 'Saved.' };
        });
      },
    },

    // A person's step after the piece is confirmed live: status exported, with an optional link.
    content_exported: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, ['id', 'url']);
        const id = uuid(a.id), url = https(a.url, { optional: true });
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockRow(c, id);
          if (before.status !== 'approved') throw new HttpError(409, 'Only approved pieces can be marked exported.');
          await c.query("update public.content_pieces set status = 'exported', published_url = coalesce(nullif($2, ''), published_url), updated_at = now() where id = $1", [id, url]);
          const after = await rowFor(c, id);
          await audit({ action: 'content_exported', entity: 'content_pieces', entityId: id,
            detail: `Marked exported ${label(before)}${url ? ': ' + url : ''}`, before: snap(before), after: snap(after) });
          return { ok: true, message: 'Marked exported.' };
        });
      },
    },

    content_delete: {
      perm: 'content',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockRow(c, id);
          await toTrash(c, ctx.staff.userId, 'content_pieces', id, before);
          await c.query('delete from public.content_pieces where id = $1', [id]);
          const live = website(before) && (before.status === 'approved' || before.status === 'exported');
          await audit({ action: 'content_delete', entity: 'content_pieces', entityId: id,
            detail: `Deleted ${label(before)} to trash${live ? ', leaves the website on the next deploy' : ''}`, before: snap(before), after: null });
          return { ok: true, message: live ? 'Deleted. It is in the trash, and leaves the website on the next deploy.' : 'Deleted. It is in the trash.' };
        });
      },
    },

    // New post: news and events typed in by a person, saved as a website draft.
    content_new: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, ['type', 'title', 'body_md', ...META_KEYS]);
        const type = oneOf(a.type, NEW_TYPES) as string;
        const title = str(a.title, 300, { min: 1 }), body = str(a.body_md, MAX_BODY, { min: 1 });
        const meta = readMeta(type, a);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const r = await c.query(
            `insert into public.content_pieces (channel, content_type, source_type, title, body_md, status, ai_generated, meta)
             values ('website_blog', $1, 'manual', $2, $3, 'draft', false, $4::jsonb) returning id`,
            [type, title, body, JSON.stringify(meta)]);
          const id = r.rows[0].id;
          const after = await rowFor(c, id);
          await audit({ action: 'content_new', entity: 'content_pieces', entityId: id,
            detail: `New ${type} draft: ${label(after)}`, before: null, after: snap(after) });
          return { ok: true, message: 'Saved as a draft. It goes on the website only once approved and the site is deployed.', id };
        });
      },
    },

    // Starts a generate-content run from the database. The run itself shows in content_runs.
    content_generate: {
      perm: 'content',
      run: async (a, ctx) => {
        only(a, ['source_type', 'diff', 'build_label']);
        const type = oneOf(a.source_type, GENERATE) as string;
        // generate-content keeps only triggered_by in content_runs; the person is in admin_audit.
        const body: Record<string, unknown> = { triggered_by: 'hq' };
        if (type === 'release_notes') {
          body.diff = str(a.diff, MAX_DIFF, { min: 1 });
          const lbl = str(a.build_label, 80, { optional: true });
          if (lbl) body.build_label = lbl;
        } else if (a.diff !== undefined || a.build_label !== undefined) throw bad();
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          // One run of each kind at a time.
          await c.query('select pg_advisory_xact_lock(hashtext($1))', ['content_generate:' + type]);
          const busy = await c.query(
            `select started_at from public.content_runs
              where source_type = $1 and finished_at is null and started_at > now() - interval '${RUN_TIMEOUT_MIN} minutes'
              order by started_at desc limit 1`, [type]);
          // A run's row appears only once generate-content starts, so also check for a start in the last minute.
          const recent = await c.query(
            `select 1 from public.admin_audit where action = 'content_generate' and after->>'source_type' = $1
                and created_at > now() - interval '60 seconds' limit 1`, [type]);
          if (busy.rows[0] || recent.rows[0]) throw new HttpError(409, 'A run of this kind is still going. Wait for it to finish.');
          const t = await c.query('select now() as at');
          await c.query('select public.notify_content_generate($1, $2::jsonb)', [type, JSON.stringify(body)]);
          await audit({ action: 'content_generate', entity: 'content_runs', entityId: null,
            detail: `Started ${type.replace(/_/g, ' ')}${body.build_label ? ' for ' + body.build_label : ''}${type === 'release_notes' ? ` (${String(body.diff).length.toLocaleString('en-GB')} characters of diff)` : ''}`,
            before: null, after: { source_type: type, build_label: body.build_label ?? null, triggered_by: 'hq' } });
          // pg_net sends the request once this transaction commits.
          return { ok: true, message: 'Started. The result shows under Recent runs.', started_at: t.rows[0].at, source_type: type };
        });
      },
    },

    // Recent runs, newest first, with a state for each.
    content_runs: {
      perm: 'content',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(
          `select r.id, r.triggered_by, r.source_type, r.started_at, r.finished_at, r.pieces_created, r.pieces_failed,
                  r.error_detail, ${RUN_STATE} as state, extract(epoch from (coalesce(r.finished_at, now()) - r.started_at))::int as seconds
             from public.content_runs r order by r.started_at desc limit 25`);
        return { data: { runs: r.rows, now: new Date().toISOString(), timeout_min: RUN_TIMEOUT_MIN } };
      },
    },

    // Area pages: scope and quality-bar figures, and what the next batch would draft.
    // A read-only preview straight from the database; it never calls generate-content.
    content_area_preview: {
      perm: 'content',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(
          `select (select row_to_json(s) from public.content_location_page_stats() s) as stats,
                  (select coalesce(json_agg(x), '[]') from public.content_eligible_areas($1, $2) x) as areas,
                  (select coalesce(json_agg(g order by g.value), '[]') from (select kind, value, label from public.content_geo_scope where active) g) as scope`,
          [AREA_MIN_VENUES, AREA_BATCH]);
        const row = r.rows[0] || {};
        const stats = row.stats || {};
        const eligible = Number(stats.eligible || 0);
        return { data: {
          stats, scope: row.scope || [], areas: eligible < AREA_FLOOR ? [] : (row.areas || []),
          below_floor: eligible < AREA_FLOOR, floor: AREA_FLOOR, min_venues: AREA_MIN_VENUES, batch: AREA_BATCH,
        } };
      },
    },
  };
}
