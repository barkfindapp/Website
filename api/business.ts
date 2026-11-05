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

const DB_URL = process.env.SUPABASE_DB_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

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
