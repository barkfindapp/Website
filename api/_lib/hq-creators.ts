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
const STEP_KEYS = ['user', 'offer_code', 'premium', 'agreement', 'email'] as const;
const MAX_B64 = 8 * 1024 * 1024; // ~5 MB of PDF once base64 encoded, with headroom

// The columns the HQ cards and edits read. account_email and contact_email are hidden
// without users_contact (in creators_list).
const COLS = `id, slug, display_name, primary_handle, handles, followers, followers_platform, followers_on,
  account_email, contact_email, user_id, tier, bespoke_terms, offer_code, code_cap, status, terms_version,
  terms_agreed_at, signature_name, signed_at, agreement_path, bespoke_agreement_path, setup, notes, source,
  created_at, activated_at, ended_at, ended_reason`;

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
const defaultCode = (slug: string) => slug.toUpperCase().replace(/[^A-Z0-9]/g, '') + '20';

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

const COUNTS_SQL = `select count(*) filter (where status = 'applied')::int as applied,
  count(*) filter (where status = 'active')::int as active,
  count(*) filter (where status in ('ended','declined'))::int as ended_declined
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
        const out = contact ? rows : rows.map((x: any) => ({ ...x, account_email: null, contact_email: null }));
        return { data: { rows: out, counts, terms_version: filter } };
      },
    },
    // Edit the HQ-editable fields, audited with before and after. Signature fields are not editable.
    creator_update: {
      perm: 'creators',
      run: async (a, ctx) => {
        only(a, ['id', 'tier', 'account_email', 'contact_email', 'offer_code', 'bespoke_terms', 'code_cap', 'notes']);
        const id = uuid(a.id);
        const f: Record<string, unknown> = {};
        if ('tier' in a) f.tier = oneOf(a.tier, TIERS);
        if ('account_email' in a) f.account_email = email(a.account_email, { optional: true }) || null;
        if ('contact_email' in a) f.contact_email = email(a.contact_email, { optional: true }) || null;
        if ('offer_code' in a) f.offer_code = str(a.offer_code, 40, { optional: true }).toUpperCase() || null;
        if ('bespoke_terms' in a) f.bespoke_terms = str(a.bespoke_terms, 4000, { optional: true }) || null;
        if ('code_cap' in a) f.code_cap = intOrNull(a.code_cap, 1000000);
        if ('notes' in a) f.notes = str(a.notes, 4000, { optional: true }) || null;
        const keys = Object.keys(f);
        if (!keys.length) throw new HttpError(409, 'Nothing has changed.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query(`select ${COLS} from public.creators where id = $1 for update`, [id])).rows[0];
          if (!before) throw new HttpError(404, 'That creator no longer exists.');
          if (before.tier === 'bespoke' && 'tier' in f && f.tier !== 'bespoke') { /* allowed */ }
          const sets = keys.map((k, i) => `${k} = $${i + 2}`);
          await c.query(`update public.creators set ${sets.join(', ')}, updated_at = now() where id = $1`, [id, ...keys.map((k) => f[k])]);
          const after = (await c.query(`select ${COLS} from public.creators where id = $1`, [id])).rows[0];
          const pick = (o: any) => Object.fromEntries(keys.map((k) => [k, o[k]]));
          await audit({ action: 'creator_update', entity: 'creators', entityId: id, detail: `Edited creator ${before.display_name}: ${keys.join(', ')}`, before: pick(before), after: pick(after) });
          return { ok: true, message: 'Saved.' };
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
        const codeIn = str(a.offer_code, 40, { optional: true });
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const tv = (await c.query("select value from public.app_config where key = 'creator_terms_version'")).rows[0];
          const terms_version = tv && tv.value != null ? String(tv.value) : null;
          const base = slugify(display_name);
          let slug = base, n = 1;
          while ((await c.query('select 1 from public.creators where slug = $1', [slug])).rows[0]) { n += 1; slug = base + '-' + n; }
          const offer_code = (codeIn ? codeIn.toUpperCase() : defaultCode(slug));
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
        await writeTx(pool, ctx.staff.userId, async (c, audit) => audit({ action: 'creator_check', entity: 'creators', detail: 'Checked creator integrations', after: result }));
        return { ok: true, data: result };
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
        if (content_base64.length > 7 * 1024 * 1024) throw new HttpError(413, 'That file is too large. The limit is 5 MB.');
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
