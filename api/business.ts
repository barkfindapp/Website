// /api/business - server side of the business portal (claim a venue, and in later
// tasks manage the listing and reply to reviews). The browser sends the owner's
// Supabase access token plus { op, args }. We verify the token with Supabase, map
// the auth user to their profiles row, then run one op from the OPS whitelist.
//
// Like /api/hq: the browser never sends SQL, every query is a constant with bound
// parameters, and all access is through the service role (the pg pool), so no new
// client-side write access or RLS policy is needed. Ownership is checked on the
// server for every op that needs it (from Task 4 on). Claims only need a signed-in,
// real account.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { HttpError, bad, obj, only, uuid, str } from './_lib/hq-core.js';
import { sendClaimReceived } from './_lib/business-email.js';
import { AMENITY_CODES, AMENITY_GROUPS, CATEGORY_GROUP } from './_lib/amenities.js';

const DB_URL = process.env.SUPABASE_DB_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const UPLOAD_BUCKET = 'business-uploads';

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
// Service-role client, server only, for issuing signed upload URLs into the private
// business-uploads bucket. Never sent to the browser.
const admin = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

// Fields an owner may change, and the dog-policy values the app allows.
const OWNER_FIELDS = ['description', 'website', 'opening_hours', 'amenities', 'dog_policy', 'dog_policy_note'] as const;
const DOG_POLICIES = ['welcome', 'restricted', 'not_allowed'] as const;
const MAX_PHOTOS = 6;

export const maxDuration = 30;

// The signed-in user: their auth id and email, and their profiles.id (what
// business_claims.user_id references). A real account only, never a guest.
type User = { authId: string; email: string; profileId: string; fullName: string };

async function requireUser(req: VercelRequest): Promise<User> {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Please sign in.');
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, 'Please sign in again.');
  if (data.user.is_anonymous) throw new HttpError(403, 'Please sign in with a real account, not a guest.');
  // handle_new_user creates a profiles row on sign-up, but guard the rare race.
  const r = await pool.query('select id, full_name from public.profiles where user_id = $1', [data.user.id]);
  const prof = r.rows[0];
  if (!prof) throw new HttpError(409, 'Your account is still being set up. Try again in a moment.');
  return { authId: data.user.id, email: data.user.email || '', profileId: prof.id, fullName: prof.full_name || '' };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function email(v: unknown): string {
  const s = str(v, 254, { min: 3 }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw bad();
  return s;
}
// The hostname of a website or email domain, lower-cased, without a leading www.
function host(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    const u = new URL(/^https?:/i.test(v) ? v : 'https://' + v);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch { return null; }
}
function emailDomain(e: string): string | null {
  const at = e.lastIndexOf('@');
  return at > 0 ? e.slice(at + 1).trim().toLowerCase() || null : null;
}

// The signed-in user must be an active owner or manager of this venue.
async function requireOwner(authId: string, locationId: string) {
  const r = await pool.query(
    'select 1 from public.location_owners where location_id = $1 and user_id = $2 and revoked_at is null limit 1',
    [locationId, authId]);
  if (!r.rowCount) throw new HttpError(403, 'You do not manage this venue.');
}

// Validate and normalise one owner-edit field. Returns the value to store, or throws.
function cleanField(field: string, v: unknown): unknown {
  if (field === 'description') return str(v, 2000, { optional: true }) || null;
  if (field === 'website') {
    const s = str(v, 500, { optional: true });
    if (s && !host(s)) throw new HttpError(400, 'That website does not look like a web address.');
    return s || null;
  }
  if (field === 'dog_policy_note') return str(v, 300, { optional: true }) || null;
  if (field === 'dog_policy') {
    if (v === '' || v === null || v === undefined) return null;
    if (typeof v !== 'string' || !(DOG_POLICIES as readonly string[]).includes(v)) throw bad();
    return v;
  }
  if (field === 'opening_hours') {
    // An array of day lines, as the app and HQ store it. Empty means "cleared".
    if (!Array.isArray(v)) throw bad();
    const lines = v.map((x) => str(x, 120)).slice(0, 14);
    return lines;
  }
  if (field === 'amenities') {
    if (!Array.isArray(v) || v.length > AMENITY_CODES.length) throw bad();
    const codes = [...new Set(v.map((x) => str(x, 60, { min: 1 })))];
    const unknown = codes.filter((c) => !AMENITY_CODES.includes(c));
    if (unknown.length) throw new HttpError(400, 'That is not a BarkFind amenity: ' + unknown.slice(0, 3).join(', ').slice(0, 120));
    return codes.sort((x, y) => AMENITY_CODES.indexOf(x) - AMENITY_CODES.indexOf(y));
  }
  throw bad();
}

function oneOfExt(v: unknown): string {
  const s = String(v || '').toLowerCase();
  if (s === 'jpg' || s === 'jpeg') return 'jpg';
  if (s === 'png') return 'png';
  throw new HttpError(400, 'Photos must be JPEG or PNG.');
}
function cryptoId(): string { return (globalThis.crypto as Crypto).randomUUID().replace(/-/g, ''); }

// Two values differ, treating amenities as a set and ignoring order.
function differs(field: string, a: unknown, b: unknown): boolean {
  if (field === 'amenities' || field === 'opening_hours') {
    const sa = JSON.stringify([...((a as unknown[]) || [])].slice().sort());
    const sb = JSON.stringify([...((b as unknown[]) || [])].slice().sort());
    return sa !== sb;
  }
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

type Ctx = { user: User };
type Op = { run: (a: Record<string, unknown>, ctx: Ctx) => Promise<unknown> };

const OPS: Record<string, Op> = {
  // Find a BarkFind place by name and town. Live places only (flagged = false).
  search_venues: {
    run: async (a) => {
      const q = str(only(a, ['q']).q, 100, { min: 2 });
      // Each word must appear somewhere in the name or address, so "barking dog
      // taunton" narrows rather than widens. Anchored with bound parameters only.
      const terms = q.split(/\s+/).filter(Boolean).slice(0, 6).map((w) => '%' + w + '%');
      const r = await pool.query(
        `select id, name, coalesce(address, '') as address, website
           from public.locations
          where flagged = false
            and (name || ' ' || coalesce(address, '')) ilike all($1::text[])
          order by name
          limit 10`,
        [terms],
      );
      return { data: { venues: r.rows } };
    },
  },

  // Submit a claim for a venue. Always tied to a venue (location_id is required),
  // so a web claim never arrives with none, unlike the app form.
  submit_claim: {
    run: async (a, ctx) => {
      only(a, ['location_id', 'role', 'phone', 'work_email', 'evidence_url', 'message']);
      const locationId = uuid(a.location_id);
      const role = str(a.role, 120, { min: 1 });
      const phone = str(a.phone, 40, { min: 5 });
      const workEmail = email(a.work_email);
      const evidenceUrl = str(a.evidence_url, 500, { optional: true });
      const message = str(a.message, 2000, { optional: true });
      if (evidenceUrl && !host(evidenceUrl)) throw new HttpError(400, 'That evidence link does not look like a web address.');

      // The venue must exist and be live.
      const loc = (await pool.query('select id, name, website, flagged from public.locations where id = $1', [locationId])).rows[0];
      if (!loc || loc.flagged) throw new HttpError(404, 'That venue is not available to claim.');

      // A venue can already have an active owner. We still accept the claim, but the
      // claimant is told it will be checked with the current owner, and HQ is warned.
      const hasOwner = ((await pool.query(
        'select 1 from public.location_owners where location_id = $1 and revoked_at is null limit 1', [locationId],
      )).rowCount ?? 0) > 0;

      // Soft rate limit: a handful of claims per account in a few minutes.
      const recent = await pool.query(
        "select count(*)::int as n from public.business_claims where user_id = $1 and created_at > now() - interval '5 minutes'",
        [ctx.user.profileId],
      );
      if (recent.rows[0].n >= 5) throw new HttpError(429, 'That is a lot of claims at once. Try again in a few minutes.');

      // One pending claim per person per venue.
      const dupe = await pool.query(
        "select 1 from public.business_claims where user_id = $1 and location_id = $2 and status = 'pending' limit 1",
        [ctx.user.profileId, locationId],
      );
      if (dupe.rowCount) throw new HttpError(409, 'You already have a claim waiting on this venue.');

      const matches = (() => {
        const site = host(loc.website), dom = emailDomain(workEmail);
        if (!site || !dom) return null;
        return dom === site || dom.endsWith('.' + site);
      })();

      const ins = await pool.query(
        `insert into public.business_claims
           (location_id, user_id, status, claimant_name, claimant_email, claimant_phone, message,
            evidence_url, role, work_email_matches_site, source)
         values ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, 'web')
         returning id`,
        [locationId, ctx.user.profileId, ctx.user.fullName || null, workEmail, phone, message || null,
          evidenceUrl || null, role, matches],
      );
      const claimId = ins.rows[0].id as string;

      // Tell HQ. hq_alerts is unique on (kind, ref), so re-firing is a no-op.
      try {
        const body = 'A venue owner claimed ' + loc.name + ' through the website.'
          + (hasOwner ? ' This venue already has an active owner, so check with them before approving.' : '');
        await pool.query(
          "select public.hq_fire_alert('business_claim', $1, 'warn', $2, $3, 'https://www.barkfind.com/hq#act/claims')",
          [claimId, 'New business claim for ' + loc.name, body],
        );
      } catch (e: any) { console.error('business claim alert', e?.message); }

      // Confirmation email to the work email. Best effort: the claim is saved either way.
      let emailed = false;
      if (resend) emailed = await sendClaimReceived(resend, workEmail, ctx.user.fullName, loc.name);

      return { data: { ok: true, emailed, has_owner: hasOwner } };
    },
  },

  // ---------- Manage listing (Task 4) ----------
  // The venues this owner manages, with any change still waiting.
  my_venues: {
    run: async (a, ctx) => {
      only(a, []);
      const r = await pool.query(
        `select l.id, l.name, coalesce(l.address, '') as address, lo.role, l.barkfind_verified,
                (select jsonb_build_object('id', cr.id, 'created_at', cr.created_at)
                   from public.listing_change_requests cr
                  where cr.location_id = l.id and cr.source = 'owner' and cr.status = 'pending'
                  order by cr.created_at desc limit 1) as pending_change
           from public.location_owners lo join public.locations l on l.id = lo.location_id
          where lo.user_id = $1 and lo.revoked_at is null
          order by l.name`, [ctx.user.authId]);
      return { data: { venues: r.rows } };
    },
  },
  // One venue's current listing, the editable values, the amenity options for its
  // category, and any change waiting for approval (old and new side by side).
  venue_for_edit: {
    run: async (a, ctx) => {
      const locationId = uuid(only(a, ['location_id']).location_id);
      await requireOwner(ctx.user.authId, locationId);
      const l = (await pool.query(
        `select id, name, coalesce(address,'') as address, category, description, website,
                opening_hours, amenities, dog_policy, dog_policy_note, image_url, barkfind_verified
           from public.locations where id = $1`, [locationId])).rows[0];
      if (!l) throw new HttpError(404, 'That venue no longer exists.');
      const group = CATEGORY_GROUP[l.category as string] || 'pub-cafe-bar';
      const pending = (await pool.query(
        `select id, changes, current_values, photo_paths, created_at
           from public.listing_change_requests
          where location_id = $1 and source = 'owner' and status = 'pending'
          order by created_at desc limit 1`, [locationId])).rows[0] || null;
      return { data: { venue: l, amenity_options: AMENITY_GROUPS[group] || [], pending } };
    },
  },
  // Save an edit as one listing_change_request (source owner). Nothing on the venue
  // changes until HQ applies it. Refuses a second pending change on the same venue.
  submit_change: {
    run: async (a, ctx) => {
      only(a, ['location_id', 'changes', 'photo_paths']);
      const locationId = uuid(a.location_id);
      await requireOwner(ctx.user.authId, locationId);
      const raw = obj(a.changes);
      for (const k of Object.keys(raw)) if (!(OWNER_FIELDS as readonly string[]).includes(k)) throw bad();
      const photoPaths: string[] = a.photo_paths === undefined ? []
        : Array.isArray(a.photo_paths) ? a.photo_paths.map((p) => str(p, 300, { min: 1 }))
        : (() => { throw bad(); })();
      if (photoPaths.length > MAX_PHOTOS) throw bad();
      // Uploads must sit under this venue's folder (where the signed URL put them).
      if (photoPaths.some((p) => !p.startsWith(locationId + '/'))) throw bad();

      const cur = (await pool.query(
        `select description, website, opening_hours, amenities, dog_policy, dog_policy_note
           from public.locations where id = $1`, [locationId])).rows[0];
      if (!cur) throw new HttpError(404, 'That venue no longer exists.');

      // Keep only fields that actually change; snapshot the current value of each.
      const changes: Record<string, unknown> = {};
      const currentValues: Record<string, unknown> = {};
      for (const f of Object.keys(raw)) {
        const val = cleanField(f, raw[f]);
        if (differs(f, val, cur[f])) { changes[f] = val; currentValues[f] = cur[f] ?? null; }
      }
      if (!Object.keys(changes).length && !photoPaths.length) throw new HttpError(400, 'Nothing has changed.');

      const dupe = await pool.query(
        "select 1 from public.listing_change_requests where location_id = $1 and source = 'owner' and status = 'pending' limit 1", [locationId]);
      if (dupe.rowCount) throw new HttpError(409, 'You already have a change waiting for approval on this venue. Withdraw it first.');

      const ins = await pool.query(
        `insert into public.listing_change_requests
           (location_id, requested_by, requester_role, changes, current_values, source, photo_paths, status)
         values ($1, $2, 'business', $3::jsonb, $4::jsonb, 'owner', $5, 'pending') returning id`,
        [locationId, ctx.user.authId, JSON.stringify(changes), JSON.stringify(currentValues), photoPaths.length ? photoPaths : null]);
      const reqId = ins.rows[0].id as string;
      try {
        const name = (await pool.query('select name from public.locations where id = $1', [locationId])).rows[0]?.name || 'a venue';
        await pool.query(
          "select public.hq_fire_alert('owner_change_request', $1, 'warn', $2, $3, 'https://www.barkfind.com/hq#act/inbox')",
          [reqId, 'Owner change for ' + name, 'A venue owner submitted a listing change for ' + name + '.']);
      } catch (e: any) { console.error('owner change alert', e?.message); }
      return { data: { ok: true } };
    },
  },
  // Withdraw a change that is still waiting.
  withdraw_change: {
    run: async (a, ctx) => {
      const id = uuid(only(a, ['id']).id);
      const row = (await pool.query('select location_id, status from public.listing_change_requests where id = $1', [id])).rows[0];
      if (!row) throw new HttpError(404, 'That change no longer exists.');
      await requireOwner(ctx.user.authId, row.location_id);
      if (row.status !== 'pending') throw new HttpError(409, 'That change has already been decided.');
      await pool.query("update public.listing_change_requests set status = 'withdrawn', updated_at = now() where id = $1 and status = 'pending'", [id]);
      return { data: { ok: true } };
    },
  },
  // A short-lived signed URL to upload one resized photo into business-uploads. The
  // client resizes in the browser and uploads straight to the bucket with the token.
  photo_upload_url: {
    run: async (a, ctx) => {
      only(a, ['location_id', 'ext']);
      const locationId = uuid(a.location_id);
      await requireOwner(ctx.user.authId, locationId);
      const ext = oneOfExt(a.ext);
      if (!admin) throw new HttpError(503, 'Uploads are not configured on the server.');
      const path = locationId + '/' + cryptoId() + '.' + ext;
      const { data, error } = await admin.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw new HttpError(502, 'Could not start the upload. Try again.');
      return { data: { path: data.path, token: data.token } };
    },
  },

  // ---------- Reply to reviews (Task 5) ----------
  // Approved reviews for a venue the owner manages, each with its reply and status.
  venue_reviews: {
    run: async (a, ctx) => {
      const locationId = uuid(only(a, ['location_id']).location_id);
      await requireOwner(ctx.user.authId, locationId);
      const r = await pool.query(
        `select rv.id, rv.paw_rating, rv.review_text, rv.created_at,
                rr.id as reply_id, rr.body as reply_body, rr.status as reply_status, rr.decline_reason as reply_decline_reason
           from public.reviews rv
           left join public.review_replies rr on rr.review_id = rv.id
          where rv.location_id = $1 and rv.status = 'approved'
          order by rv.created_at desc limit 100`, [locationId]);
      return { data: { reviews: r.rows } };
    },
  },
  // Write or edit a reply. One per review; editing sends it back to pending. Saved as
  // pending for a person to approve (human moderation for now; a future moderate-reply
  // edge function would score it here before saving).
  submit_reply: {
    run: async (a, ctx) => {
      only(a, ['review_id', 'body']);
      const reviewId = uuid(a.review_id);
      const body = str(a.body, 1000, { min: 1 });
      const rv = (await pool.query('select id, location_id, status from public.reviews where id = $1', [reviewId])).rows[0];
      if (!rv || rv.status !== 'approved' || !rv.location_id) throw new HttpError(404, 'That review is not available to reply to.');
      await requireOwner(ctx.user.authId, rv.location_id);
      const up = await pool.query(
        `insert into public.review_replies (review_id, location_id, author_user_id, body, status, updated_at)
         values ($1, $2, $3, $4, 'pending', now())
         on conflict (review_id) do update set body = excluded.body, author_user_id = excluded.author_user_id,
           status = 'pending', moderation = null, decided_by = null, decided_at = null, decline_reason = null, updated_at = now()
         returning id`,
        [reviewId, rv.location_id, ctx.user.authId, body]);
      const replyId = up.rows[0].id as string;
      try {
        const name = (await pool.query('select name from public.locations where id = $1', [rv.location_id])).rows[0]?.name || 'a venue';
        await pool.query("select public.hq_fire_alert('review_reply', $1, 'warn', $2, $3, 'https://www.barkfind.com/hq#act/reviews')",
          [replyId, 'Reply to moderate for ' + name, 'A venue replied to a review and it needs approval.']);
      } catch (e: any) { console.error('review reply alert', e?.message); }
      return { data: { ok: true } };
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only.' });
  try {
    const user = await requireUser(req);
    const body = obj(req.body);
    only(body, ['op', 'args']);
    const op = typeof body.op === 'string' && Object.prototype.hasOwnProperty.call(OPS, body.op) ? OPS[body.op] : null;
    if (!op) throw bad();
    const args = body.args === undefined ? {} : obj(body.args);
    return res.status(200).json(await op.run(args, { user }));
  } catch (e: any) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error('business', e?.message || e);
    return res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
  }
}
