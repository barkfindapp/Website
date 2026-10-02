// Phase 2: Places. Search all places on the server (there are about 50,000), open one,
// edit it, add one, flag it, switch Sponsored or BarkFind verified, delete it to the trash,
// and find and merge real duplicates.
//
// Edits respect the locks. A person's change to a locked-type field (name, address,
// opening_hours, website, image_url, dog_policy) adds it to locked_fields and sets
// details_set_at/by in the same update, so trg_details_lock lets it through and automatic
// writers cannot overwrite it later. A category change sets category_locked,
// category_set_at and category_set_by in the same update (trg_category_lock).
//
// Duplicates match on more than the name: the same name AND within 150 m or at the same
// address. Merging runs in one transaction. Reviews, favourites, rating signals, reports,
// claims, listing changes, restrictions and the dog policy check move to the kept place.
// Where a person reviewed or favourited both, the kept place's one stays. Every row that is
// moved or removed is recorded in hq_trash with the merged place.
//
// Google place IDs. A merged or deleted place's place_id goes on location_place_id_blocklist
// in the same transaction (trg_skip_blocked_place_id then stops the scanners re-adding it),
// and the blocklist row is recorded in hq_trash so undoing the merge or delete can lift it.
// Add a place looks the Google place ID up on the server, through the hq-place-lookup edge
// function (the Google key stays in Supabase secrets):
// an ID already in locations opens that place instead; a blocked ID cannot be added.
import type { Pool, PoolClient } from 'pg';
import { HttpError, bad, only, uuid, str, oneOf, bool, writeTx, toTrash } from './hq-core.js';
import { CATEGORIES } from './hq-flags.js';
import type { Op, Ctx } from './hq-act.js';
import { AMENITY_CODES, AMENITY_GROUPS, CATEGORY_GROUP, AMENITY_SOURCE } from './amenities.js';

const PAGE = 50;
const DUP_METRES = 150;
const LOCKABLE = ['name', 'address', 'opening_hours', 'website', 'image_url', 'dog_policy'] as const;
const DOG_POLICIES = ['welcome', 'restricted', 'not_allowed'] as const;
const FLAG_REASONS = ['Permanently closed', 'Not actually dog-friendly', 'Wrong information', 'Duplicate listing', 'Inappropriate content'] as const;
const STATUS = {
  all: 'true',
  live: 'not l.flagged',
  flagged: 'l.flagged',
  verified: 'l.is_verified',
  unverified: 'not l.is_verified and not l.flagged',
  sponsored: 'l.is_sponsored',
  no_photo: "not l.flagged and coalesce(l.image_url, '') = ''",
  locked: "(l.locked_fields <> '{}' or l.category_locked)",
} as const;
const SORT = { name: 'l.name, l.id', rating: 'l.barkfind_rating desc nulls last, l.review_count desc nulls last, l.id', newest: 'l.created_at desc nulls last, l.id' } as const;
const URL_RE = /^https?:\/\/[^\s<>"]+$/i;
const NORM_NAME = (t: string) => `lower(trim(${t}.name))`;
const NORM_ADDR = (t: string) => `lower(regexp_replace(coalesce(${t}.address, ''), '[^a-zA-Z0-9]', '', 'g'))`;

function url(v: unknown, { https = false } = {}): string {
  const s = str(v, 500, { optional: true });
  if (s && (!URL_RE.test(s) || (https && !/^https:/i.test(s)))) throw bad();
  return s;
}
function lines(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 14) throw bad();
  return v.map((x) => str(x, 80, { min: 1 }));
}
// ---------- Google Places, through the hq-place-lookup edge function ----------
// The Google key lives only in Supabase secrets, so /api/hq never holds it: it calls
// hq-place-lookup server to server with the service role key. The function logs each Google
// call to api_usage itself (provider google_places, meta.source "hq").
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,300}$/;
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lng - a.lng) * t;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(x)));
};
async function placeLookup(body: Record<string, unknown>): Promise<any> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new HttpError(503, 'The Google lookup is not set up on the server.');
  let r: Response;
  try {
    r = await fetch(`${SUPABASE_URL}/functions/v1/hq-place-lookup`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new HttpError(502, 'The Google lookup did not answer. Try again in a minute.'); }
  const j: any = await r.json().catch(() => null);
  if (r.ok && j && !j.error) return j;
  console.error('hq place lookup', r.status, JSON.stringify(j).slice(0, 300));
  // Show Google's refusal plainly (status and Google's reason), never any key.
  const clean = (v: unknown) => String(v ?? '').replace(/[^A-Za-z0-9 _.,:'-]/g, '').slice(0, 120);
  if (r.status === 401) throw new HttpError(502, 'The Google lookup refused HQ (status 401: the server key was not accepted).');
  if (j && j.status) throw new HttpError(502, `Google refused the lookup (status ${clean(j.status)}${j.detail ? ', ' + clean(j.detail) : ''}).`);
  throw new HttpError(502, `The Google lookup failed (status ${r.status}${j && j.error ? ': ' + clean(j.error) : ''}).`);
}
// ---------- Google Maps links ----------
// Reads a position from a full Google Maps URL: the place's own pin (!3d…!4d…) first, then the
// map centre (@lat,lng), then a q/ll/query/center/destination parameter. Also the place name
// from /maps/place/<name>/ when there is one. Only UK positions count.
export function mapsPosition(raw: string): { lat: number; lng: number; name: string } | null {
  let u = raw;
  try { u = decodeURIComponent(raw); } catch { /* keep as is */ }
  const pick = (m: RegExpExecArray | null) => (m ? { lat: Number(m[1]), lng: Number(m[2]) } : null);
  const at = pick(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(u)) || pick(/@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u))
    || pick(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(u));
  if (!at || !(at.lat >= 49.8 && at.lat <= 61.1 && at.lng >= -8.7 && at.lng <= 2.1)) return null;
  const nm = /\/maps\/place\/([^/@?]+)/.exec(u);
  return { ...at, name: nm ? nm[1].replace(/\+/g, ' ').trim().slice(0, 200) : '' };
}
// Short links are followed on the server, only through Google's own hosts, at most 3 redirects,
// 5 seconds in all. Nothing else is fetched.
const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl'];
const GOOGLE_HOSTS = /^(?:www\.|maps\.)?google\.(?:com|co\.uk)$/;
function isShortLink(u: URL) { return u.protocol === 'https:' && (u.hostname === 'maps.app.goo.gl' || (u.hostname === 'goo.gl' && u.pathname.startsWith('/maps'))); }
async function followShortLink(start: URL): Promise<string> {
  const deadline = Date.now() + 5000;
  let url = start;
  for (let hop = 0; hop <= 3; hop++) {
    // A Google page (not a short link) is the destination: read it without fetching.
    if (GOOGLE_HOSTS.test(url.hostname)) return url.toString();
    if (url.hostname === 'consent.google.com') { const c = url.searchParams.get('continue'); if (c) return c; throw new HttpError(422, 'Google asked for cookie consent instead of opening the map. Open the link in Google Maps and copy the full address instead.'); }
    if (!SHORT_HOSTS.includes(url.hostname) || url.protocol !== 'https:') throw new HttpError(422, 'That link went somewhere other than Google Maps.');
    if (hop === 3) break;
    const left = deadline - Date.now();
    if (left <= 0) throw new HttpError(504, 'The short link took too long to open. Try again, or paste the full Google Maps address.');
    let r: Response;
    try { r = await fetch(url.toString(), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(left) }); }
    catch { throw new HttpError(504, 'The short link took too long to open. Try again, or paste the full Google Maps address.'); }
    const loc = r.headers.get('location');
    if (r.status < 300 || r.status > 399 || !loc) throw new HttpError(422, `That short link did not lead to a map (status ${r.status}).`);
    url = new URL(loc, url);
  }
  throw new HttpError(422, 'That short link redirected too many times.');
}

// Is this place ID already a place, or blocked?
async function placeIdState(c: PoolClient | Pool, placeId: string) {
  const [ex, bl] = await Promise.all([
    c.query('select id, name, flagged from public.locations where place_id = $1', [placeId]),
    c.query('select reason, kept_location_id, created_at from public.location_place_id_blocklist where place_id = $1', [placeId]),
  ]);
  return { existing: ex.rows[0] || null, blocked: bl.rows[0] || null };
}
// Puts a removed place's place_id on the blocklist; returns the row added (null if it had none or it was already there).
async function block(c: PoolClient, placeId: string | null, reason: 'merged' | 'deleted', keptId: string | null, userId: string) {
  if (!placeId) return null;
  const r = await c.query(
    `insert into public.location_place_id_blocklist (place_id, reason, kept_location_id, created_by) values ($1, $2, $3, $4)
     on conflict (place_id) do nothing returning to_jsonb(location_place_id_blocklist.*) as r`, [placeId, reason, keptId, userId]);
  return r.rows[0]?.r || null;
}

function coord(v: unknown, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw bad();
  return v;
}

// The editable fields, validated. Only keys that were sent come back.
function readFields(a: Record<string, unknown>) {
  const f: Record<string, unknown> = {};
  if ('name' in a) f.name = str(a.name, 200, { min: 1 });
  if ('category' in a) f.category = oneOf(a.category, CATEGORIES);
  if ('address' in a) f.address = str(a.address, 300, { optional: true }) || null;
  if ('website' in a) f.website = url(a.website) || null;
  if ('image_url' in a) f.image_url = url(a.image_url, { https: true }) || null;
  if ('description' in a) f.description = str(a.description, 2000, { optional: true }) || null;
  if ('dog_policy' in a) f.dog_policy = oneOf(a.dog_policy, DOG_POLICIES, { optional: true }) || null;
  if ('dog_policy_note' in a) f.dog_policy_note = str(a.dog_policy_note, 300, { optional: true }) || null;
  if ('opening_hours' in a) { const h = lines(a.opening_hours); f.opening_hours = h.length ? h : null; }
  // Amenities are the app's fixed codes (api/_lib/amenities.ts, copied from the app); anything else is refused.
  if ('amenities' in a) {
    if (!Array.isArray(a.amenities) || a.amenities.length > AMENITY_CODES.length) throw bad();
    const codes = [...new Set(a.amenities.map((x) => str(x, 60, { min: 1 })))];
    const unknown = codes.filter((c) => !AMENITY_CODES.includes(c));
    if (unknown.length) throw new HttpError(400, `Not an app amenity: ${unknown.slice(0, 3).join(', ').slice(0, 120)}.`);
    f.amenities = codes.sort((x, y) => AMENITY_CODES.indexOf(x) - AMENITY_CODES.indexOf(y));
  }
  return f;
}
const FIELD_KEYS = ['name', 'category', 'address', 'website', 'image_url', 'description', 'dog_policy', 'dog_policy_note', 'opening_hours', 'amenities'];
const same = (x: unknown, y: unknown) => {
  // Amenities are a set: the same codes in another order are not a change.
  if (Array.isArray(x) && Array.isArray(y)) return JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());
  return JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
};
const cast = (k: string) => (k === 'opening_hours' ? '::jsonb' : k === 'amenities' ? '::text[]' : '');
const val = (k: string, v: unknown) => (k === 'opening_hours' && v != null ? JSON.stringify(v) : v);

const DETAIL_COLS = `l.id, l.name, l.category, l.categories, l.address, l.latitude, l.longitude, l.place_id, l.website, l.description, l.amenities,
  l.community_amenities, l.opening_hours, l.image_url, l.image_source, l.image_credit, l.dog_policy, l.dog_policy_note, l.dog_policy_source,
  l.dog_policy_at, l.barkfind_rating, l.google_rating, l.review_count, l.is_verified, l.google_verified, l.barkfind_verified, l.is_sponsored,
  l.flagged, l.flag_reason, l.flagged_at, l.flag_rule, l.flag_review, l.mylo_verdict, l.authority, l.restrictions_state, l.created_at,
  l.locked_fields, l.details_set_at, l.details_set_by, l.category_locked, l.category_set_at, l.category_set_by`;

async function lockPlace(c: PoolClient, id: string) {
  const r = await c.query(`select ${DETAIL_COLS} from public.locations l where l.id = $1 for update`, [id]);
  if (!r.rows[0]) throw new HttpError(404, 'That place no longer exists. Refresh the list.');
  return r.rows[0];
}
const label = (p: any) => `"${String(p.name || '').slice(0, 80)}"`;

// Everything that hangs off a set of places, for the trash (same shape as Flagged places' delete).
const RELATED = `jsonb_build_object(
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
  'listing_change_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.listing_change_requests x where x.location_id = l.id),
  'mylo_backfill_queue', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.mylo_backfill_queue x where x.location_id = l.id),
  'geograph_requeue', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.geograph_requeue x where x.location_id = l.id))`;

// Pairs of real duplicates: the same name, and within 150 m or at the same address.
// Pairs or names that someone marked "not duplicates" are left out.
const DUP_PAIRS = `
  with n as materialized (
    select id, lower(trim(name)) as nm, latitude as lat, longitude as lng,
           lower(regexp_replace(coalesce(address, ''), '[^a-zA-Z0-9]', '', 'g')) as ad
      from public.locations),
  pairs as (
    -- A quick box first (0.0015 deg of latitude and 0.0035 of longitude are both over 150 m
    -- anywhere in the UK), then the true distance.
    select a.id as a_id, b.id as b_id from n a join n b on b.nm = a.nm and b.id > a.id
     where (a.lat is not null and b.lat is not null and abs(a.lat - b.lat) < 0.0015 and abs(a.lng - b.lng) < 0.0035
            and earth_distance(ll_to_earth(a.lat, a.lng), ll_to_earth(b.lat, b.lng)) <= ${DUP_METRES})
        or (length(a.ad) >= 8 and a.ad = b.ad))
  select p.a_id, p.b_id from pairs p
   where not exists (select 1 from public.hq_place_dup_ignores i where i.location_a = least(p.a_id, p.b_id) and i.location_b = greatest(p.a_id, p.b_id))
     and not exists (select 1 from public.locations x join public.duplicate_ignores d on d.name = ${NORM_NAME('x')} where x.id = p.a_id)`;

export function placeOps(pool: Pool): Record<string, Op> {
  return {
    // The app's amenities, by category group, for the tick-lists in Edit and Add a place.
    places_amenities: {
      perm: 'places_edit',
      run: async (a) => { only(a, []); return { data: { groups: AMENITY_GROUPS, category_group: CATEGORY_GROUP, source: AMENITY_SOURCE } }; },
    },

    places_list: {
      perm: 'places_edit',
      run: async (a) => {
        only(a, ['q', 'category', 'status', 'sort', 'page']);
        const q = str(a.q, 100, { optional: true }).toLowerCase();
        const category = oneOf(a.category, CATEGORIES, { optional: true });
        const status = (oneOf(a.status, Object.keys(STATUS) as (keyof typeof STATUS)[], { optional: true }) || 'all') as keyof typeof STATUS;
        const sort = (oneOf(a.sort, Object.keys(SORT) as (keyof typeof SORT)[], { optional: true }) || 'name') as keyof typeof SORT;
        const page = Number.isInteger(a.page) && (a.page as number) >= 0 && (a.page as number) < 2000 ? a.page as number : 0;
        const w: string[] = [STATUS[status]], p: unknown[] = [];
        if (category) { p.push(category); w.push(`l.category = $${p.length}`); }
        if (q) {
          if (/^[0-9a-f-]{36}$/.test(q)) { p.push(q); w.push(`l.id::text = $${p.length}`); }
          else {
            p.push('%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%');
            w.push(`(lower(l.name) like $${p.length} or lower(coalesce(l.address, '')) like $${p.length} or l.place_id = $${p.push(q)})`);
          }
        }
        const where = w.join(' and ');
        const [rows, total] = await Promise.all([
          pool.query(
            `select l.id, l.name, l.category, left(l.address, 90) as address, l.barkfind_rating, l.google_rating, l.review_count,
                    l.is_verified, l.barkfind_verified, l.is_sponsored, l.flagged, l.flag_reason, (coalesce(l.image_url, '') <> '') as has_photo,
                    (l.locked_fields <> '{}' or l.category_locked) as locked, l.created_at
               from public.locations l where ${where} order by ${SORT[sort]} limit ${PAGE} offset ${page * PAGE}`, p),
          pool.query(`select count(*)::int as n from public.locations l where ${where}`, p),
        ]);
        return { data: { rows: rows.rows, total: total.rows[0].n, page, page_size: PAGE } };
      },
    },

    place_detail: {
      perm: 'places_edit',
      run: async (a) => {
        const id = uuid(only(a, ['id']).id);
        const r = await pool.query(
          `select ${DETAIL_COLS},
                  coalesce(ds.display_name, dp.full_name) as details_set_by_name, coalesce(cs.display_name, cp.full_name) as category_set_by_name,
                  coalesce(fs.display_name, fp.full_name) as flagged_by_name,
                  (select jsonb_build_object(
                     'reviews', count(*), 'approved', count(*) filter (where status = 'approved'), 'pending', count(*) filter (where status = 'pending'))
                     from public.reviews where location_id = l.id) as reviews,
                  (select count(*)::int from public.favorites where location_id = l.id) as favourites,
                  (select count(*)::int from public.rating_signals where location_id = l.id) as signals,
                  (select count(*)::int from public.location_reports where location_id = l.id and status = 'open') as open_reports,
                  (select count(*)::int from public.business_claims where location_id = l.id) as claims,
                  (select count(*)::int from public.location_restrictions where location_id = l.id) as restrictions,
                  (select count(*)::int from public.listing_change_requests where location_id = l.id and status = 'pending') as pending_changes,
                  (select coalesce(jsonb_agg(x), '[]') from (select left(review_text, 300) as text, paw_rating, status, created_at
                     from public.reviews where location_id = l.id order by created_at desc limit 5) x) as recent_reviews
             from public.locations l
             left join public.hq_staff ds on ds.user_id = l.details_set_by left join public.profiles dp on dp.user_id = l.details_set_by
             left join public.hq_staff cs on cs.user_id = l.category_set_by left join public.profiles cp on cp.user_id = l.category_set_by
             left join public.hq_staff fs on fs.user_id = l.flagged_by left join public.profiles fp on fp.user_id = l.flagged_by
            where l.id = $1`, [id]);
        if (!r.rows[0]) throw new HttpError(404, 'That place no longer exists. Refresh the list.');
        return { data: { ...r.rows[0], lockable: LOCKABLE, categories_allowed: CATEGORIES, flag_reasons: FLAG_REASONS } };
      },
    },

    // Edit: only the fields that changed. Locked-type fields and the category get their locks.
    place_save: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['id', ...FIELD_KEYS]);
        const id = uuid(a.id), f = readFields(a);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockPlace(c, id);
          const changed = Object.keys(f).filter((k) => !same(f[k], before[k]));
          if (!changed.length) throw new HttpError(409, 'Nothing has changed.');
          const sets: string[] = [], p: unknown[] = [id];
          for (const k of changed) { p.push(val(k, f[k])); sets.push(`${k} = $${p.length}${cast(k)}`); }
          // The dog policy lock covers its note too. Any person's save sets details_set_at,
          // so trg_details_lock never undoes it.
          const lock = [...new Set(changed.map((k) => (k === 'dog_policy_note' ? 'dog_policy' : k)).filter((k) => (LOCKABLE as readonly string[]).includes(k)))];
          if (lock.length) { p.push(lock); sets.push(`locked_fields = (select array(select distinct unnest(locked_fields || $${p.length}::text[])))`); }
          p.push(ctx.staff.userId); sets.push(`details_set_at = now(), details_set_by = $${p.length}`);
          if (changed.includes('category')) { p.push(ctx.staff.userId); sets.push(`category_locked = true, category_set_at = now(), category_set_by = $${p.length}`); }
          await c.query(`update public.locations set ${sets.join(', ')} where id = $1`, p);
          const after = (await c.query(`select ${DETAIL_COLS} from public.locations l where l.id = $1`, [id])).rows[0];
          const pick = (o: any) => Object.fromEntries([...changed, 'locked_fields', 'category_locked'].map((k) => [k, o[k]]));
          await audit({ action: 'place_save', entity: 'locations', entityId: id,
            detail: `Edited place ${label(after)}: ${changed.join(', ')}${lock.length || changed.includes('category') ? ' (locked)' : ''}`,
            before: pick(before), after: pick(after) });
          return { ok: true, message: lock.length || changed.includes('category') ? 'Saved. The fields you changed are locked, so automatic updates will not overwrite them.' : 'Saved.' };
        });
      },
    },

    // Lets automatic updates write a field again.
    place_unlock: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'field']);
        const id = uuid(a.id), field = oneOf(a.field, [...LOCKABLE, 'category'] as const) as string;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockPlace(c, id);
          if (field === 'category') {
            if (!before.category_locked) throw new HttpError(409, 'The category is not locked.');
            await c.query('update public.locations set category_locked = false, category_set_at = now(), category_set_by = $2 where id = $1', [id, ctx.staff.userId]);
          } else {
            if (!(before.locked_fields || []).includes(field)) throw new HttpError(409, 'That field is not locked.');
            await c.query('update public.locations set locked_fields = array_remove(locked_fields, $2), details_set_at = now(), details_set_by = $3 where id = $1', [id, field, ctx.staff.userId]);
          }
          await audit({ action: 'place_unlock', entity: 'locations', entityId: id, detail: `Unlocked ${field.replace(/_/g, ' ')} on ${label(before)}`,
            before: { locked_fields: before.locked_fields, category_locked: before.category_locked }, after: { unlocked: field } });
          return { ok: true, message: 'Unlocked. Automatic updates can change it again.' };
        });
      },
    },

    // Finds the place on Google near the given point, and says for each match whether it is
    // already a place in BarkFind, blocked (merged or deleted before), or new.
    // A pasted Google Maps link: short links (maps.app.goo.gl, goo.gl/maps) are followed here,
    // then the position is read from the full address.
    place_resolve_link: {
      perm: 'places_edit',
      run: async (a) => {
        const raw = str(only(a, ['url']).url, 2000, { min: 10 });
        let u: URL;
        try { u = new URL(raw); } catch { throw bad(); }
        const full = isShortLink(u) ? await followShortLink(u) : raw;
        const pos = mapsPosition(full);
        if (!pos) throw new HttpError(422, 'That link has no UK map position in it. In Google Maps, open the place and use Share, then Copy link.');
        return { data: { latitude: pos.lat, longitude: pos.lng, name: pos.name, followed: full !== raw } };
      },
    },

    place_lookup: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['name', 'address', 'latitude', 'longitude']);
        const name = str(a.name, 120, { min: 2 }); str(a.address, 300, { optional: true });
        const lat = coord(a.latitude, 49.8, 61.1), lng = coord(a.longitude, -8.7, 2.1);
        const j = await placeLookup({ action: 'search', name, lat, lng });
        const found = ((j && j.matches) || []).filter((x: any) => x && typeof x.place_id === 'string' && PLACE_ID_RE.test(x.place_id) && typeof x.lat === 'number')
          .map((x: any) => ({ place_id: x.place_id, name: x.name || '', address: x.address || '', latitude: x.lat, longitude: x.lng,
            metres: typeof x.distance_m === 'number' ? x.distance_m : metres({ lat, lng }, { lat: x.lat, lng: x.lng }), business_status: x.business_status || null }))
          .filter((x: any) => x.metres <= 1000).sort((x: any, y: any) => x.metres - y.metres).slice(0, 3);
        const matches = [];
        for (const m of found) {
          const st = await placeIdState(pool, m.place_id);
          matches.push({ ...m, status: st.existing ? 'exists' : st.blocked ? 'blocked' : 'new',
            existing: st.existing, blocked: st.blocked ? { reason: st.blocked.reason, kept_location_id: st.blocked.kept_location_id, at: st.blocked.created_at } : null });
        }
        return { data: { matches } };
      },
    },

    // Add: a new place with its Google place ID, its fields locked as a person set them.
    // Warns about a same-name place close by.
    place_add: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, [...FIELD_KEYS, 'latitude', 'longitude', 'place_id', 'confirm']);
        const f = readFields(a);
        if (!f.name || !f.category) throw bad();
        const lat = coord(a.latitude, 49.8, 61.1), lng = coord(a.longitude, -8.7, 2.1);
        const placeId = str(a.place_id, 300, { min: 10 });
        if (!PLACE_ID_RE.test(placeId)) throw bad();
        const force = bool(a.confirm, { optional: true });
        // Already a place, or blocked: say so before spending a Google call.
        const st = await placeIdState(pool, placeId);
        if (st.existing) throw new HttpError(409, `That Google place is already in BarkFind as "${st.existing.name}". Opening it instead.`, 'exists:' + st.existing.id);
        if (st.blocked) throw new HttpError(409, `That Google place was ${st.blocked.reason === 'merged' ? 'merged into another place' : 'deleted'} on ${new Date(st.blocked.created_at).toLocaleDateString('en-GB')}, so it is blocked and cannot be added again.`, 'blocked');
        // The ID must be a real Google place close to where the person put it.
        const g = (await placeLookup({ action: 'details', place_id: placeId })).place;
        if (!g || typeof g.lat !== 'number') throw new HttpError(409, 'Google does not know that place ID. Look it up again.');
        if (metres({ lat, lng }, { lat: g.lat, lng: g.lng }) > 1000) throw new HttpError(409, 'That Google place is more than 1 km from where you put it. Check the location and look it up again.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const again = await placeIdState(c, placeId);
          if (again.existing) throw new HttpError(409, `That Google place is already in BarkFind as "${again.existing.name}". Opening it instead.`, 'exists:' + again.existing.id);
          if (again.blocked) throw new HttpError(409, 'That Google place is blocked and cannot be added again.', 'blocked');
          if (!force) {
            const near = (await c.query(
              `select l.id, l.name, l.address, round(earth_distance(ll_to_earth($2, $3), ll_to_earth(l.latitude, l.longitude)))::int as metres
                 from public.locations l
                where ${NORM_NAME('l')} = lower(trim($1)) and earth_box(ll_to_earth($2, $3), ${DUP_METRES}) @> ll_to_earth(l.latitude, l.longitude)
                order by 4 limit 1`, [f.name, lat, lng])).rows[0];
            if (near) throw new HttpError(409, `"${near.name}" is already listed ${near.metres} m away${near.address ? ' at ' + near.address : ''}. If this is a different place, tap Add anyway.`, 'near_duplicate');
          }
          const keys = Object.keys(f);
          const lock = [...new Set(keys.filter((k) => f[k] != null).map((k) => (k === 'dog_policy_note' ? 'dog_policy' : k)).filter((k) => (LOCKABLE as readonly string[]).includes(k)))];
          const p: unknown[] = keys.map((k) => val(k, f[k]));
          const cols = [...keys, 'latitude', 'longitude', 'locked_fields', 'details_set_at', 'details_set_by', 'category_locked', 'category_set_at', 'category_set_by', 'place_id'];
          const vals = [...keys.map((k, i) => `$${i + 1}${cast(k)}`)];
          p.push(lat, lng, lock, ctx.staff.userId, placeId);
          const n = keys.length;
          vals.push(`$${n + 1}`, `$${n + 2}`, `$${n + 3}::text[]`, 'now()', `$${n + 4}`, 'true', 'now()', `$${n + 4}`, `$${n + 5}`);
          // trg_skip_blocked_place_id returns no row for a blocked ID.
          const ins = await c.query(`insert into public.locations (${cols.join(', ')}) values (${vals.join(', ')}) returning id`, p);
          if (!ins.rows[0]) throw new HttpError(409, 'That Google place is blocked and cannot be added again.', 'blocked');
          const id = ins.rows[0].id;
          const after = (await c.query(`select ${DETAIL_COLS} from public.locations l where l.id = $1`, [id])).rows[0];
          await audit({ action: 'place_add', entity: 'locations', entityId: id, detail: `Added place ${label(after)} (${after.category}, Google ${placeId.slice(0, 40)})${force ? ', after a near-duplicate warning' : ''}`, before: null, after });
          return { ok: true, message: 'Added. It shows in the app straight away.', id };
        });
      },
    },

    place_flag: {
      perm: 'places_moderate',
      run: async (a, ctx) => {
        only(a, ['id', 'reason', 'note']);
        const id = uuid(a.id), reason = oneOf(a.reason, FLAG_REASONS) as string, note = str(a.note, 300, { optional: true });
        const text = note ? `${reason}: ${note}` : reason;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockPlace(c, id);
          if (before.flagged) throw new HttpError(409, 'It is already flagged.');
          await c.query("update public.locations set flagged = true, flag_reason = $2, flagged_at = now(), flagged_by = $3, flag_rule = 'manual' where id = $1", [id, text, ctx.staff.userId]);
          await audit({ action: 'place_flag', entity: 'locations', entityId: id, detail: `Flagged ${label(before)}: ${text}`.slice(0, 300),
            before: { flagged: false, flag_reason: before.flag_reason }, after: { flagged: true, flag_reason: text, flag_rule: 'manual' } });
          return { ok: true, message: 'Flagged. It is hidden from the app and waiting in Flagged places.' };
        });
      },
    },

    // Sponsored, and BarkFind verified (is_verified itself is worked out by a trigger).
    place_toggle: {
      perm: 'places_edit',
      run: async (a, ctx) => {
        only(a, ['id', 'field', 'on']);
        const id = uuid(a.id), field = oneOf(a.field, ['is_sponsored', 'barkfind_verified'] as const) as string, on = bool(a.on);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockPlace(c, id);
          if (before[field] === on) throw new HttpError(409, 'No change.');
          await c.query(`update public.locations set ${field} = $2 where id = $1`, [id, on]);
          const name = field === 'is_sponsored' ? 'Sponsored' : 'BarkFind verified';
          await audit({ action: 'place_toggle', entity: 'locations', entityId: id, detail: `${name} ${on ? 'on' : 'off'} for ${label(before)}`,
            before: { [field]: before[field] }, after: { [field]: on } });
          return { ok: true, message: `${name} ${on ? 'on' : 'off'}.` };
        });
      },
    },

    // Delete one place to the trash, with everything that hangs off it.
    place_delete: {
      perm: 'places_delete',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await lockPlace(c, id);
          const blocked = await block(c, before.place_id, 'deleted', null, ctx.staff.userId);
          await c.query(`insert into public.hq_trash (entity, entity_id, row_data, related, deleted_by)
                          select 'locations', l.id::text, to_jsonb(l), ${RELATED} || jsonb_build_object('place_id_blocklist', $3::jsonb), $2 from public.locations l where l.id = $1`,
            [id, ctx.staff.userId, JSON.stringify(blocked ? [blocked] : [])]);
          await c.query('delete from public.locations where id = $1', [id]);
          await audit({ action: 'place_delete', entity: 'locations', entityId: id, detail: `Deleted place ${label(before)} to trash${blocked ? ', Google place ID blocked' : ''}`, before, after: { place_id_blocklist: blocked } });
          return { ok: true, message: 'Deleted. It is in the trash with its reviews, favourites and reports.' };
        });
      },
    },

    // Groups of real duplicates (connected pairs), with what each copy has.
    dups_list: {
      perm: 'places_delete',
      run: async (a) => {
        only(a, []);
        const pairs = (await pool.query(DUP_PAIRS)).rows as { a_id: string; b_id: string }[];
        const parent = new Map<string, string>();
        const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(x, r); return r; };
        for (const { a_id, b_id } of pairs) {
          if (!parent.has(a_id)) parent.set(a_id, a_id);
          if (!parent.has(b_id)) parent.set(b_id, b_id);
          parent.set(find(a_id), find(b_id));
        }
        const ids = [...parent.keys()];
        if (!ids.length) return { data: { groups: [], pairs: 0 } };
        const info = (await pool.query(
          `select l.id, l.name, l.category, l.address, l.latitude, l.longitude, l.flagged, l.flag_reason, l.created_at, l.barkfind_rating,
                  (coalesce(l.image_url, '') <> '') as has_photo, l.place_id, (l.locked_fields <> '{}' or l.category_locked) as locked,
                  (select count(*)::int from public.reviews r where r.location_id = l.id) as reviews,
                  (select count(*)::int from public.favorites f where f.location_id = l.id) as favourites,
                  (select count(*)::int from public.rating_signals s where s.location_id = l.id) as signals
             from public.locations l where l.id = any($1::uuid[])`, [ids])).rows;
        const byId = new Map(info.map((x) => [x.id, x]));
        const groups = new Map<string, any[]>();
        for (const id of ids) { const g = find(id); if (!groups.has(g)) groups.set(g, []); if (byId.has(id)) groups.get(g)!.push(byId.get(id)); }
        // Suggested keeper: live first, then most reviews and favourites, then the oldest.
        const score = (x: any) => [x.flagged ? 0 : 1, x.reviews + x.favourites + x.signals, -new Date(x.created_at || 0).getTime()];
        const better = (x: any, y: any) => { const s = score(x), t = score(y); for (let i = 0; i < 3; i++) if (s[i] !== t[i]) return s[i] > t[i]; return false; };
        const out = [...groups.values()].filter((g) => g.length > 1).map((g) => {
          const keep = g.reduce((k, x) => (better(x, k) ? x : k), g[0]);
          return { suggested_keep: keep.id, members: g.sort((x, y) => (better(x, y) ? -1 : better(y, x) ? 1 : 0)) };
        }).sort((x, y) => y.members.length - x.members.length || String(x.members[0].name).localeCompare(String(y.members[0].name)));
        return { data: { groups: out, pairs: pairs.length } };
      },
    },

    dups_ignore: {
      perm: 'places_delete',
      run: async (a, ctx) => {
        only(a, ['ids']);
        if (!Array.isArray(a.ids) || a.ids.length < 2 || a.ids.length > 30) throw bad();
        const ids = [...new Set(a.ids.map(uuid))].sort();
        if (ids.length < 2) throw bad();
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const names = (await c.query('select id, name from public.locations where id = any($1::uuid[])', [ids])).rows;
          if (names.length !== ids.length) throw new HttpError(404, 'One of those places no longer exists. Refresh the list.');
          let n = 0;
          for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
            n += (await c.query('insert into public.hq_place_dup_ignores (location_a, location_b, ignored_by) values ($1, $2, $3) on conflict do nothing', [ids[i], ids[j], ctx.staff.userId])).rowCount || 0;
          }
          await audit({ action: 'dups_ignore', entity: 'hq_place_dup_ignores', entityId: null,
            detail: `Marked ${ids.length} places called "${String(names[0].name).slice(0, 60)}" as not duplicates`, before: null, after: { ids, pairs_added: n } });
          return { ok: true, message: 'Marked as not duplicates. They will not be suggested together again.' };
        });
      },
    },

    // Merge copies into the one kept, in one transaction. See the notes at the top of the file.
    dups_merge: {
      perm: 'places_delete',
      run: async (a, ctx) => {
        only(a, ['keep', 'drop']);
        const keep = uuid(a.keep);
        if (!Array.isArray(a.drop) || !a.drop.length || a.drop.length > 20) throw bad();
        const drop = [...new Set(a.drop.map(uuid))];
        if (drop.includes(keep)) throw bad();
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const rows = (await c.query(`select ${DETAIL_COLS} from public.locations l where l.id = any($1::uuid[]) order by l.id for update`, [[keep, ...drop]])).rows;
          if (rows.length !== drop.length + 1) throw new HttpError(404, 'One of those places no longer exists. Refresh the list.');
          const k = rows.find((x) => x.id === keep);
          // The server checks they really are duplicates: same name, and within 150 m or at the same address, and not marked otherwise.
          const check = (await c.query(
            `select d.id, d.name,
                    (${NORM_NAME('d')} = ${NORM_NAME('k')}) as same_name,
                    (d.latitude is not null and k.latitude is not null and earth_distance(ll_to_earth(k.latitude, k.longitude), ll_to_earth(d.latitude, d.longitude)) <= ${DUP_METRES * 2}) as near,
                    (length(${NORM_ADDR('k')}) >= 8 and ${NORM_ADDR('d')} = ${NORM_ADDR('k')}) as same_address,
                    exists (select 1 from public.hq_place_dup_ignores i where i.location_a = least(k.id, d.id) and i.location_b = greatest(k.id, d.id)) as ignored
               from public.locations k join public.locations d on d.id = any($2::uuid[]) where k.id = $1`, [keep, drop])).rows;
          const wrong = check.find((x) => !x.same_name || !(x.near || x.same_address) || x.ignored);
          if (wrong) throw new HttpError(409, `"${wrong.name}" is not a duplicate of the place you are keeping (it needs the same name, and to be close by or at the same address). Nothing was merged.`);

          const totals: Record<string, number> = {};
          const add = (key: string, n: number | null) => { totals[key] = (totals[key] || 0) + (n || 0); };
          for (const d of drop) {
            const removed: Record<string, unknown[]> = {}, moved: Record<string, string[]> = {};
            const take = async (key: string, sql: string, p: unknown[]) => { const r = await c.query(sql, p); removed[key] = r.rows.map((x: any) => x.r); add('removed_' + key, r.rowCount); };
            const move = async (key: string, sql: string, p: unknown[]) => { const r = await c.query(sql, p); moved[key] = r.rows.map((x: any) => x.id); add(key, r.rowCount); };
            // The removed related rows of a set of reviews, before they cascade.
            const dupReviews = (await c.query(
              `select r.id from public.reviews r where r.location_id = $1 and exists (select 1 from public.reviews k where k.location_id = $2 and k.user_id = r.user_id)`, [d, keep])).rows.map((x) => x.id);
            if (dupReviews.length) {
              await take('review_rating_signals', 'select to_jsonb(x) as r from public.rating_signals x where x.review_id = any($1::uuid[])', [dupReviews]);
              await take('moderation_log', 'select to_jsonb(x) as r from public.moderation_log x where x.review_id = any($1::uuid[])', [dupReviews]);
              await take('review_likes', 'select to_jsonb(x) as r from public.review_likes x where x.review_id = any($1::uuid[])', [dupReviews]);
              await take('user_reports_unlinked', "select jsonb_build_object('id', x.id, 'review_id', x.review_id) as r from public.user_reports x where x.review_id = any($1::uuid[])", [dupReviews]);
              await take('reviews', 'delete from public.reviews where id = any($1::uuid[]) returning to_jsonb(reviews.*) as r', [dupReviews]);
            }
            await move('reviews', 'update public.reviews set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await take('favorites', `delete from public.favorites f where f.location_id = $1 and exists (select 1 from public.favorites k where k.location_id = $2 and k.user_id = f.user_id) returning to_jsonb(f.*) as r`, [d, keep]);
            await move('favorites', 'update public.favorites set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await move('rating_signals', 'update public.rating_signals set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await move('location_reports', 'update public.location_reports set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await move('business_claims', 'update public.business_claims set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await move('listing_change_requests', 'update public.listing_change_requests set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await take('location_restrictions', `delete from public.location_restrictions x where x.location_id = $1 and exists (select 1 from public.location_restrictions k
                where k.location_id = $2 and k.source_url is not distinct from x.source_url and k.restriction_type is not distinct from x.restriction_type
                  and md5(k.source_quote) is not distinct from md5(x.source_quote)) returning to_jsonb(x.*) as r`, [d, keep]);
            await move('location_restrictions', 'update public.location_restrictions set location_id = $2 where location_id = $1 returning id', [d, keep]);
            const keeperHasCheck = (await c.query('select 1 from public.dog_policy_reviews where location_id = $1', [keep])).rows.length > 0;
            if (keeperHasCheck) await take('dog_policy_reviews', 'delete from public.dog_policy_reviews x where x.location_id = $1 returning to_jsonb(x.*) as r', [d]);
            else await move('dog_policy_reviews', 'update public.dog_policy_reviews set location_id = $2 where location_id = $1 returning id', [d, keep]);
            await take('mylo_backfill_queue', 'delete from public.mylo_backfill_queue x where x.location_id = $1 returning to_jsonb(x.*) as r', [d]);
            await take('geograph_requeue', 'delete from public.geograph_requeue x where x.location_id = $1 returning to_jsonb(x.*) as r', [d]);
            // In-app notifications that open the old copy now open the kept place.
            await move('notification_links', "update public.notifications set action_url = 'location:' || $2 where action_url = 'location:' || $1 returning id", [d, keep]);
            const dropRow = (await c.query('select to_jsonb(l.*) as r from public.locations l where id = $1', [d])).rows[0].r;
            const blocked = await block(c, dropRow.place_id || null, 'merged', keep, ctx.staff.userId);
            if (blocked) add('place_ids_blocked', 1);
            await toTrash(c, ctx.staff.userId, 'locations', d, dropRow, { merged_into: keep, moved, removed, place_id_blocklist: blocked ? [blocked] : [] });
            await c.query('delete from public.locations where id = $1', [d]);
          }
          await c.query('select public.update_barkfind_rating($1)', [keep]);
          await audit({ action: 'dups_merge', entity: 'locations', entityId: keep,
            detail: `Merged ${drop.length} duplicate${drop.length === 1 ? '' : 's'} of ${label(k)} into it (${['reviews', 'favorites', 'rating_signals', 'location_reports'].map((x) => `${totals[x] || 0} ${x.replace(/_/g, ' ')}`).join(', ')} moved)`,
            before: { keep: k, drop: rows.filter((x) => x.id !== keep) }, after: { keep, totals } });
          const kept = (totals.removed_reviews || 0) + (totals.removed_favorites || 0);
          return { ok: true, totals, message: `Merged ${drop.length} ${drop.length === 1 ? 'copy' : 'copies'} into the place you kept. ${totals.reviews || 0} reviews, ${totals.favorites || 0} favourites and ${totals.rating_signals || 0} ratings moved${kept ? `; ${kept} that the same person had on both went to the trash` : ''}. The copies are in the trash.` };
        });
      },
    },
  };
}
