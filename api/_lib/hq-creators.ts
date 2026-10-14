// HQ side of the creator programme (public.creators). RLS on the table has no policies, so
// only this server connection reads or writes it. Every integration (App Store Connect,
// RevenueCat, Resend, Supabase storage, the signed PDF) is done by the creator-admin edge
// function, never from here: these ops read and write the row and proxy to creator-admin.
// The function is guarded by the x-hq-trigger header, whose value is app_secrets.hq_trigger,
// kept server-side and never returned to the browser or logged, the same way report_reply
// handles push_trigger.
import type { Pool } from 'pg';
import { HttpError, bad, obj, only, uuid, str, oneOf, date, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';

const CREATOR_ADMIN_URL = 'https://kwwnwniyijeuorpbyvmn.supabase.co/functions/v1/creator-admin';
const TIERS = ['small', 'mid', 'bespoke'] as const;
const PLATFORMS = ['instagram', 'tiktok', 'facebook', 'youtube', 'other'] as const;
const STEP_KEYS = ['user', 'offer_code', 'premium', 'agreement', 'email'] as const;
const MAX_B64 = 6 * 1024 * 1024; // headroom over the 4.2 MB cap (Vercel's request limit is ~4.5 MB)

// The columns the HQ cards and edits read. account_email and contact_email are hidden
// without users_contact (in creators_list).
const COLS = `id, slug, display_name, primary_handle, handles, followers, followers_platform, followers_on,
  account_email, contact_email, user_id, tier, bespoke_terms, offer_code, code_cap, status, terms_version,
  terms_agreed_at, signature_name, signed_at, agreement_path, bespoke_agreement_path, setup, notes, source,
  created_at, activated_at, ended_at, ended_reason, first_post_on::text as first_post_on`;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function email(v: unknown, { optional = false } = {}): string {
  const s = str(v, 200, { optional });
  if (s && !EMAIL_RE.test(s)) throw bad();
  return s;
}
function intOrNull(v: unknown, max: number): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw bad();
  return n;
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'creator';
// Offer codes are App Store offer codes: uppercase letters and digits only, 3 to 30 long.
const OFFER_CODE_RE = /^[A-Z0-9]{3,30}$/;
const defaultCode = (slug: string) => slug.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 28) + '20';

// Call the creator-admin edge function with the server-side trigger secret. Returns the HTTP
// status and the parsed body. The secret never leaves the server.
async function callAdmin(pool: Pool, body: Record<string, unknown>): Promise<{ http_status: number } & Record<string, unknown>> {
  const sec = (await pool.query("select value from public.app_secrets where name = 'hq_trigger'")).rows[0];
  const trigger = sec && typeof sec.value === 'string' ? sec.value : null;
  if (!trigger) return { http_status: 0, ok: false, error: 'The creator-admin trigger is not set up.' };
  try {
    const res = await fetch(CREATOR_ADMIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hq-trigger': trigger },
      body: JSON.stringify(body),
    });
    const reply = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { http_status: res.status, ...reply };
  } catch {
    return { http_status: 0, ok: false, error: 'The creator-admin service did not respond.' };
  }
}

// Where each creator's first-post guarantee falls, worked out exactly as the
// creator_payout_months view does it (keep the two in step):
// Version 2 (or no version on file, the migrated rows) earn it in the month of
// first_post_on, or else of their first approved live post. Version 3 onwards earn it in the
// month of the first approved live post that went live within 30 days of the previous one.
export const TERMS_V2 = 'Version 2, 27 September 2026';
export async function guaranteeInfo(q: { query: Pool['query'] }, ids: string[]) {
  if (!ids.length) return {} as Record<string, { v2: boolean; guarantee_month: string | null; approved_live: number }>;
  const r = await q.query(
    `with ap as (select p.creator_id, p.posted_on,
                        lag(p.posted_on) over (partition by p.creator_id order by p.posted_on, p.id) as prev_on
                   from public.creator_posts p where p.status = 'approved' and p.posted_on is not null)
     select c.id, (c.terms_version = $2 or c.terms_version is null) as v2,
            to_char(case when c.terms_version = $2 or c.terms_version is null
                         then date_trunc('month', coalesce(c.first_post_on, (select min(ap.posted_on) from ap where ap.creator_id = c.id))::timestamp)
                         else date_trunc('month', (select min(ap.posted_on) from ap where ap.creator_id = c.id and ap.prev_on is not null and ap.posted_on - ap.prev_on <= 30)::timestamp)
                    end, 'YYYY-MM') as guarantee_month,
            (select count(*) from ap where ap.creator_id = c.id)::int as approved_live
       from public.creators c where c.id = any($1::uuid[])`, [ids, TERMS_V2]);
  return Object.fromEntries(r.rows.map((x) => [x.id, { v2: x.v2, guarantee_month: x.guarantee_month, approved_live: x.approved_live }]));
}

const POST_COLS = `id, creator_id, url, platform, status, note, posted_on::text as posted_on, submitted_at, reviewed_at,
  reviewed_by, created_at, updated_at`;
const POST_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'other'] as const;
const postUrl = (v: unknown) => {
  const s = str(v, 500, { min: 1 });
  let u: URL; try { u = new URL(s); } catch { throw new HttpError(400, 'Paste the full link to the post, starting https://.'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, 'Paste the full link to the post, starting https://.');
  return u.toString();
};

const COUNTS_SQL = `select count(*) filter (where status = 'applied')::int as applied,
  count(*) filter (where status = 'active')::int as active,
  count(*) filter (where status in ('ended','declined'))::int as ended_declined,
  (select count(*) from public.creator_posts where status = 'submitted')::int as posts_submitted
  from public.creators`;

export function creatorOps(pool: Pool): Record<string, Op> {
  return {
    // Counts for the Act chip and the Today card.
    creators_counts: {
      perm: 'creators',
      run: async (a) => { only(a, []); return { data: (await pool.query(COUNTS_SQL)).rows[0] }; },
    },
    // One filter's rows, newest first, plus the counts. Emails need users_contact.
    creators_list: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['filter']);
        const filter = (oneOf(a.filter, ['applied', 'active', 'ended_declined'] as const, { optional: true }) || 'applied') as string;
        // "Applications" also carries approved creators (HQ-added, signed up directly): both are
        // pre-active and still need setting up. The count stays the number of applied.
        const where = filter === 'ended_declined' ? "status in ('ended','declined')"
          : filter === 'applied' ? "status in ('applied','approved')" : "status = 'active'";
        const rows = (await pool.query(`select ${COLS} from public.creators where ${where} order by created_at desc limit 500`)).rows;
        const counts = (await pool.query(COUNTS_SQL)).rows[0];
        const contact = ctx.staff.perms.has('users_contact');
        const ids = rows.map((x: any) => x.id);
        const [posts, g] = await Promise.all([
          ids.length ? pool.query(`select ${POST_COLS} from public.creator_posts where creator_id = any($1::uuid[]) order by submitted_at desc`, [ids]) : Promise.resolve({ rows: [] as any[] }),
          guaranteeInfo(pool, ids),
        ]);
        const byCreator: Record<string, any[]> = {};
        for (const p of posts.rows) (byCreator[p.creator_id] ||= []).push(p);
        const withPosts = rows.map((x: any) => ({ ...x, posts: byCreator[x.id] || [], guarantee: g[x.id] || null }));
        const out = contact ? withPosts : withPosts.map((x: any) => ({ ...x, account_email: null, contact_email: null }));
        return { data: { rows: out, counts, terms_version: filter } };
      },
    },
    // Edit the HQ-editable fields, audited with before and after. Signature fields are not editable.
    creator_update: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'tier', 'account_email', 'contact_email', 'offer_code', 'bespoke_terms', 'code_cap', 'notes', 'followers', 'followers_platform', 'first_post_on']);
        const id = uuid(a.id);
        const f: Record<string, unknown> = {};
        if ('tier' in a) f.tier = oneOf(a.tier, TIERS);
        if ('account_email' in a) f.account_email = email(a.account_email, { optional: true }) || null;
        if ('contact_email' in a) f.contact_email = email(a.contact_email, { optional: true }) || null;
        if ('offer_code' in a) { const code = str(a.offer_code, 40, { optional: true }).toUpperCase(); if (code && !OFFER_CODE_RE.test(code)) throw new HttpError(400, 'An offer code is 3 to 30 letters or numbers, with no spaces.'); f.offer_code = code || null; }
        if ('bespoke_terms' in a) f.bespoke_terms = str(a.bespoke_terms, 4000, { optional: true }) || null;
        if ('code_cap' in a) f.code_cap = intOrNull(a.code_cap, 1000000);
        if ('notes' in a) f.notes = str(a.notes, 4000, { optional: true }) || null;
        // Re-measured following. followers_on is never typed: it is set below when the count changes.
        if ('followers' in a) f.followers = intOrNull(a.followers, 50000000);
        if ('followers_platform' in a) f.followers_platform = a.followers_platform === '' || a.followers_platform == null ? null : oneOf(a.followers_platform, PLATFORMS);
        // Version 2 creators only (checked below): a fallback first-post date for the guarantee.
        if ('first_post_on' in a) f.first_post_on = date(a.first_post_on, { optional: true }) || null;
        const keys = Object.keys(f);
        if (!keys.length) throw new HttpError(409, 'Nothing has changed.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query(`select ${COLS}, asc_offer_code_id from public.creators where id = $1 for update`, [id])).rows[0];
          if (!before) throw new HttpError(404, 'That creator no longer exists.');
          if ('first_post_on' in f && before.terms_version != null && before.terms_version !== TERMS_V2) {
            throw new HttpError(409, 'A first post date is only used for creators on version 2 of the terms. Record their posts instead.');
          }
          // Once the code is live in App Store Connect its code, tier and cap are fixed.
          if (before.asc_offer_code_id && ('offer_code' in f || 'tier' in f || 'code_cap' in f)) {
            throw new HttpError(409, 'The code exists in App Store Connect. End the partnership and set them up again to change it.');
          }
          // A new count gets today's UK date (cleared with it); an unchanged count keeps its date.
          if ('followers' in f && f.followers !== before.followers) { f.followers_on = f.followers == null ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()); keys.push('followers_on'); }
          const sets = keys.map((k, i) => `${k} = $${i + 2}`);
          await c.query(`update public.creators set ${sets.join(', ')}, updated_at = now() where id = $1`, [id, ...keys.map((k) => f[k])]);
          const after = (await c.query(`select ${COLS} from public.creators where id = $1`, [id])).rows[0];
          const pick = (o: any) => Object.fromEntries(keys.map((k) => [k, o[k]]));
          await audit({ action: 'creator_update', entity: 'creators', entityId: id, detail: `Edited creator ${before.display_name}: ${keys.join(', ')}`, before: pick(before), after: pick(after) });
          return { ok: true, message: 'Saved.' };
        });
      },
    },
    // Posts sent to us before going live (terms v3: the first two; v2 creators' posts can be
    // recorded too). Needs creators only, no money. Each write is audited with before and after.
    creator_post_add: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['creator_id', 'url', 'platform', 'note']);
        const creatorId = uuid(a.creator_id);
        const url = postUrl(a.url);
        const platform = oneOf(a.platform, POST_PLATFORMS);
        const note = str(a.note, 1000, { optional: true }) || null;
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const cr = (await c.query('select display_name from public.creators where id = $1', [creatorId])).rows[0];
          if (!cr) throw new HttpError(404, 'That creator no longer exists.');
          const row = (await c.query(
            `insert into public.creator_posts (creator_id, url, platform, note) values ($1, $2, $3, $4) returning ${POST_COLS}`,
            [creatorId, url, platform, note])).rows[0];
          await audit({ action: 'creator_post_add', entity: 'creator_posts', entityId: row.id, detail: `Added a post for ${cr.display_name}`, before: null, after: row });
          return { ok: true, message: 'Post added. It is waiting for review.' };
        });
      },
    },
    creator_post_review: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'decision', 'note']);
        const id = uuid(a.id);
        const decision = oneOf(a.decision, ['approved', 'changes_requested'] as const);
        const note = str(a.note, 1000, { optional: true }) || null;
        if (decision === 'changes_requested' && !note) throw new HttpError(400, 'Say what needs changing.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query(`select ${POST_COLS} from public.creator_posts where id = $1 for update`, [id])).rows[0];
          if (!before) throw new HttpError(404, 'That post no longer exists.');
          const after = (await c.query(
            `update public.creator_posts set status = $2, note = coalesce($3, note), reviewed_at = now(), reviewed_by = $4, updated_at = now()
              where id = $1 returning ${POST_COLS}`, [id, decision, note, ctx.staff.userId])).rows[0];
          const cr = (await c.query('select display_name from public.creators where id = $1', [before.creator_id])).rows[0];
          await audit({ action: 'creator_post_review', entity: 'creator_posts', entityId: id,
            detail: `${decision === 'approved' ? 'Approved' : 'Asked for changes to'} a post by ${cr ? cr.display_name : 'a creator'}`, before, after });
          return { ok: true, message: decision === 'approved' ? 'Approved.' : 'Changes requested.' };
        });
      },
    },
    creator_post_live: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'posted_on']);
        const id = uuid(a.id);
        const postedOn = date(a.posted_on);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query(`select ${POST_COLS} from public.creator_posts where id = $1 for update`, [id])).rows[0];
          if (!before) throw new HttpError(404, 'That post no longer exists.');
          const after = (await c.query(
            `update public.creator_posts set posted_on = $2, updated_at = now() where id = $1 returning ${POST_COLS}`, [id, postedOn])).rows[0];
          const cr = (await c.query('select display_name from public.creators where id = $1', [before.creator_id])).rows[0];
          await audit({ action: 'creator_post_live', entity: 'creator_posts', entityId: id,
            detail: `Marked a post by ${cr ? cr.display_name : 'a creator'} live on ${postedOn}`, before, after });
          return { ok: true, message: `Marked live on ${postedOn}.` };
        });
      },
    },
    // Josh signs someone up directly: source hq, status approved, current terms version,
    // signature left empty until they sign at barkfind.com/creators.
    creator_add: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['display_name', 'primary_handle', 'handles', 'followers', 'followers_platform', 'followers_on', 'account_email', 'contact_email', 'offer_code', 'tier', 'bespoke_terms', 'code_cap', 'notes']);
        const display_name = str(a.display_name, 200, { min: 1 });
        const primary_handle = str(a.primary_handle, 120, { optional: true }) || null;
        const handles: Record<string, string> = {};
        if ('handles' in a && a.handles != null) { const h = obj(a.handles); for (const k of ['instagram', 'tiktok', 'facebook']) if (k in h) { const v = str(h[k], 120, { optional: true }); if (v) handles[k] = v; } }
        const followers = intOrNull(a.followers, 1000000000);
        const followers_platform = str(a.followers_platform, 40, { optional: true }) || null;
        const followers_on = date(a.followers_on, { optional: true }) || null;
        const account_email = email(a.account_email, { optional: true }) || null;
        const contact_email = email(a.contact_email, { optional: true }) || null;
        const tier = 'tier' in a ? oneOf(a.tier, TIERS) : null;
        const bespoke_terms = str(a.bespoke_terms, 4000, { optional: true }) || null;
        const code_cap = intOrNull(a.code_cap, 1000000);
        const notes = str(a.notes, 4000, { optional: true }) || null;
        const codeIn = str(a.offer_code, 40, { optional: true }).toUpperCase();
        if (codeIn && !OFFER_CODE_RE.test(codeIn)) throw new HttpError(400, 'An offer code is 3 to 30 letters or numbers, with no spaces.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const tv = (await c.query("select value from public.app_config where key = 'creator_terms_version'")).rows[0];
          const terms_version = tv && tv.value != null ? String(tv.value) : null;
          const base = slugify(display_name);
          let slug = base, n = 1;
          while ((await c.query('select 1 from public.creators where slug = $1', [slug])).rows[0]) { n += 1; slug = base + '-' + n; }
          const offer_code = codeIn || defaultCode(slug);
          const ins = await c.query(
            `insert into public.creators (slug, display_name, primary_handle, handles, followers, followers_platform, followers_on,
               account_email, contact_email, tier, bespoke_terms, code_cap, offer_code, notes, status, source, terms_version)
             values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'approved','hq',$15) returning ${COLS}`,
            [slug, display_name, primary_handle, JSON.stringify(handles), followers, followers_platform, followers_on,
              account_email, contact_email, tier, bespoke_terms, code_cap, offer_code, notes, terms_version]);
          const row = ins.rows[0];
          await audit({ action: 'creator_add', entity: 'creators', entityId: row.id, detail: `Added creator ${display_name} (${slug})`, before: null, after: row });
          return { ok: true, message: 'Added.', data: row };
        });
      },
    },
    // Approve and set up: record the attempt, call creator-admin setup, keep the result on
    // the audit row. force re-runs only the named steps.
    creator_setup: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'force']);
        const id = uuid(a.id);
        let force: string[] | undefined;
        if ('force' in a && a.force != null) { if (!Array.isArray(a.force)) throw bad(); force = a.force.map((x) => oneOf(x, STEP_KEYS) as string); }
        const auditId = await writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const row = (await c.query('select id, display_name from public.creators where id = $1', [id])).rows[0];
          if (!row) throw new HttpError(404, 'That creator no longer exists.');
          return audit({ action: 'creator_setup', entity: 'creators', entityId: id, detail: `Ran set-up for ${row.display_name}${force ? ' (force: ' + force.join(', ') + ')' : ''}`, before: { force: force || null } });
        });
        const body: Record<string, unknown> = { action: 'setup', creator_id: id };
        if (force) body.force = force;
        const result = await callAdmin(pool, body);
        await pool.query('update public.admin_audit set after = $2::jsonb where id = $1', [auditId, JSON.stringify(result)]);
        return { ok: true, data: result };
      },
    },
    // Decline: status declined, no email.
    creator_decline: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id']);
        const id = uuid(a.id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query('select id, display_name, status from public.creators where id = $1 for update', [id])).rows[0];
          if (!before) throw new HttpError(404, 'That creator no longer exists.');
          if (before.status !== 'applied' && before.status !== 'approved') throw new HttpError(409, 'Use End partnership for an active creator.');
          await c.query("update public.creators set status = 'declined', updated_at = now() where id = $1", [id]);
          await audit({ action: 'creator_decline', entity: 'creators', entityId: id, detail: `Declined ${before.display_name}`, before: { status: before.status }, after: { status: 'declined' } });
          return { ok: true, message: 'Declined.' };
        });
      },
    },
    // End the partnership: record the attempt, call creator-admin end, keep the result.
    creator_end: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'reason']);
        const id = uuid(a.id), reason = str(a.reason, 500, { min: 1 });
        const auditId = await writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const row = (await c.query('select id, display_name, status from public.creators where id = $1', [id])).rows[0];
          if (!row) throw new HttpError(404, 'That creator no longer exists.');
          return audit({ action: 'creator_end', entity: 'creators', entityId: id, detail: `Ended ${row.display_name}: ${reason}`.slice(0, 300), before: { status: row.status, reason } });
        });
        const result = await callAdmin(pool, { action: 'end', creator_id: id, reason });
        await pool.query('update public.admin_audit set after = $2::jsonb where id = $1', [auditId, JSON.stringify(result)]);
        return { ok: true, data: result };
      },
    },
    // Check the integrations. No IDs or keys reach the browser, only each one's ok state.
    creator_check: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, []);
        const result = await callAdmin(pool, { action: 'check' });
        // The full result (with any IDs or config) stays on the audit row only.
        await writeTx(pool, ctx.staff.userId, async (c, audit) => audit({ action: 'creator_check', entity: 'creators', detail: 'Checked creator integrations', after: result }));
        const data: Record<string, unknown> = {};
        for (const k of ['app_store_connect', 'revenuecat', 'resend', 'agreement_branding']) {
          const v = result[k] && typeof result[k] === 'object' ? result[k] as Record<string, unknown> : null;
          data[k] = v && v.ok === true ? { ok: true } : { ok: false, ...(v && v.error ? { error: String(v.error) } : {}) };
        }
        if (result.ok === false && result.error) data.error = String(result.error);
        return { ok: true, data };
      },
    },
    // A private 5-minute link to a stored agreement PDF (signed or bespoke).
    creator_agreement_url: {
      perm: 'creators',
      run: async (a) => {
        only(a, ['id', 'which']);
        const id = uuid(a.id), which = oneOf(a.which, ['signed', 'bespoke'] as const);
        return { data: await callAdmin(pool, { action: 'agreement_url', creator_id: id, which }) };
      },
    },
    // The agreement PDF as base64, without storing anything.
    creator_preview_agreement: {
      perm: 'creators',
      run: async (a) => {
        only(a, ['id']);
        const id = uuid(a.id);
        return { data: await callAdmin(pool, { action: 'preview_agreement', creator_id: id }) };
      },
    },
    // Upload a signed bespoke agreement (PDF, 5 MB or less). The browser reads the file and
    // sends it base64; this op only passes it to creator-admin.
    creator_upload_bespoke: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'filename', 'content_base64']);
        const id = uuid(a.id), filename = str(a.filename, 200, { min: 1 });
        const content_base64 = str(a.content_base64, MAX_B64, { min: 1 });
        if (content_base64.length > Math.floor(4.2 * 1024 * 1024)) throw new HttpError(413, 'That file is too large. The limit is 3 MB.');
        const auditId = await writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const row = (await c.query('select id, display_name from public.creators where id = $1', [id])).rows[0];
          if (!row) throw new HttpError(404, 'That creator no longer exists.');
          return audit({ action: 'creator_upload_bespoke', entity: 'creators', entityId: id, detail: `Uploaded bespoke agreement for ${row.display_name}: ${filename.slice(0, 120)}`, before: { filename } });
        });
        const result = await callAdmin(pool, { action: 'upload_bespoke', creator_id: id, filename, content_base64 });
        const forAudit: Record<string, unknown> = { ...result }; delete forAudit.pdf_base64;
        await pool.query('update public.admin_audit set after = $2::jsonb where id = $1', [auditId, JSON.stringify(forAudit)]);
        return { ok: true, data: result };
      },
    },
  };
}
