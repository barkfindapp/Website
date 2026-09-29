// Phase 1b ops for /api/hq: the Team page, invites, sign-in activity and My account.
// HQ staff get HQ access only (a row in hq_staff); nothing here ever grants user_roles.
// Changes to someone's access ask for your own password again (checked here on the
// server) and are refused on yourself and on the last active owner.
import type { Pool, PoolClient } from 'pg';
import { Resend } from 'resend';
import { HttpError, bad, only, uuid, str, oneOf, writeTx } from './hq-core.js';
import { PERMISSIONS, LEVELS, type Level, type Perm } from './hq-staff.js';
import type { Op, Ctx } from './hq-act.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const INVITE_DAYS = 7;
const TEAM_LEVELS = ['moderator', 'support', 'viewer'] as const;   // what staff_manage alone can give
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// ---------- Supabase auth admin API (service role, server side only) ----------
async function authAdmin(path: string, method: string, body?: unknown) {
  if (!SERVICE_KEY) throw new HttpError(503, 'Invites and account changes need SUPABASE_SERVICE_ROLE_KEY on the server.');
  const r = await fetch(SUPABASE_URL + '/auth/v1' + path, {
    method, headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) {
    console.error('hq auth admin', method, path.replace(/[0-9a-f-]{36}/g, ':id'), r.status, j && (j.error_code || j.code));
    throw new HttpError(502, 'Supabase did not accept that change. Try again.');
  }
  return j;
}

// Checks a password by signing in with it, then deletes that extra session at once.
async function passwordOk(pool: Pool | PoolClient, email: string, password: string) {
  if (!email || !password) return false;
  const r = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST', headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) return false;
  const j: any = await r.json().catch(() => null);
  try {
    const sid = JSON.parse(Buffer.from(String(j.access_token).split('.')[1], 'base64url').toString()).session_id;
    if (sid) await pool.query('delete from auth.sessions where id = $1', [sid]);
  } catch { /* the extra session simply expires */ }
  return true;
}
async function requirePassword(pool: Pool, ctx: Ctx, password: unknown) {
  const p = typeof password === 'string' ? password : '';
  if (!(await passwordOk(pool, ctx.staff.email, p))) throw new HttpError(403, 'That password is not right.');
}

// Signs someone out everywhere: their sessions and refresh tokens go.
async function signOutEverywhere(c: PoolClient, userId: string) {
  await c.query('delete from auth.refresh_tokens where user_id = $1', [userId]);   // user_id is varchar here
  const r = await c.query('delete from auth.sessions where user_id = $1', [userId]);
  return r.rowCount || 0;
}

const staffRow = async (c: PoolClient | Pool, userId: string) =>
  (await c.query('select to_jsonb(s) as r from public.hq_staff s where user_id = $1', [userId])).rows[0]?.r ?? null;
const isAdminLevel = (l: unknown) => l === 'owner' || l === 'admin';
function canTouch(ctx: Ctx, target: any, newLevel?: string) {
  if (target.user_id === ctx.staff.userId) throw new HttpError(403, 'You cannot change your own access.');
  if ((isAdminLevel(target.level) || isAdminLevel(newLevel)) && !ctx.staff.perms.has('staff_admins')) throw new HttpError(403, 'You do not have access to this');
}
async function notLastOwner(c: PoolClient, target: any) {
  if (target.level !== 'owner' || target.status !== 'active') return;
  const n = (await c.query("select count(*)::int n from public.hq_staff where level = 'owner' and status = 'active' and user_id <> $1", [target.user_id])).rows[0].n;
  if (n < 1) throw new HttpError(409, 'This is the last active owner, so it cannot be changed.');
}
function permList(v: unknown): Perm[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > PERMISSIONS.length) throw bad();
  return [...new Set(v.map((p) => oneOf(p, PERMISSIONS) as Perm))];
}

async function accessEmail(to: string, name: string, level: string, hqUrl: string) {
  if (!RESEND_API_KEY) return false;
  const resend = new Resend(RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'BarkFind <hello@barkfind.com>', to,
    subject: 'You have access to BarkFind HQ',
    text: `Hi${name ? ' ' + name : ''},\n\nYou have been given ${level} access to BarkFind HQ, the operations console for BarkFind.\n\nSign in at ${hqUrl} with your usual BarkFind email and password. The first time, it will ask you to add a second sign-in step with an authenticator app.\n\nIf you were not expecting this, you can ignore this email.\n\nBarkFind`,
  });
  if (error) { console.error('hq access email', error.name); return false; }
  return true;
}

export function teamOps(pool: Pool): Record<string, Op | { perm: null; run: Op['run'] }> {
  // One write pattern for every team change: password, rate limit, before/after, audit.
  const change = (label: string, action: string, a: Record<string, unknown>, ctx: Ctx,
    fn: (c: PoolClient, target: any) => Promise<{ message: string; signOut?: boolean }>) =>
    (async () => {
      const userId = uuid(a.user_id);
      await requirePassword(pool, ctx, a.password);
      return writeTx(pool, ctx.staff.userId, async (c, audit) => {
        const before = await staffRow(c, userId);
        if (!before) throw new HttpError(404, 'That person is not on the team.');
        const res = await fn(c, before);
        await c.query('update public.hq_staff set updated_at = now() where user_id = $1', [userId]);
        const signedOut = res.signOut ? await signOutEverywhere(c, userId) : 0;
        const after = await staffRow(c, userId);
        await audit({ action, entity: 'hq_staff', entityId: userId, detail: `${label}: ${String(before.email || '').slice(0, 80)}${signedOut ? ' (signed out everywhere)' : ''}`, before, after });
        return { ok: true, message: res.message };
      });
    })();

  return {
    // ---------- Team ----------
    team_list: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, []);
        const r = await pool.query(
          `select s.user_id, s.email, s.display_name, s.level, s.status, s.grants, s.denies, s.alert_email, s.alert_push, s.note,
                  s.invited_at, s.accepted_at, s.last_seen_at, s.removed_at, s.updated_at,
                  coalesce(ib.display_name, ib.email) as invited_by_name,
                  exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.factor_type = 'totp' and f.status = 'verified') as mfa,
                  (s.status = 'invited' and s.invited_at < now() - interval '${INVITE_DAYS} days') as expired
             from public.hq_staff s left join public.hq_staff ib on ib.user_id = s.invited_by
            order by (s.status = 'removed'), array_position(array['owner','admin','moderator','support','viewer'], s.level), s.display_name`);
        return { data: { staff: r.rows, me: ctx.staff.userId, can_admins: ctx.staff.perms.has('staff_admins'), can_grants: ctx.staff.level === 'owner', levels: ctx.staff.perms.has('staff_admins') ? LEVELS : TEAM_LEVELS, permissions: PERMISSIONS } };
      },
    },
    team_invite: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['email', 'name', 'level']);
        const email = str(a.email, 254, { min: 3 }).toLowerCase();
        if (!EMAIL_RE.test(email)) throw bad();
        const name = str(a.name, 80, { min: 1 });
        const level = oneOf(a.level, LEVELS) as Level;
        if (isAdminLevel(level) && !ctx.staff.perms.has('staff_admins')) throw new HttpError(403, 'You do not have access to this');
        const existing = (await pool.query('select id from auth.users where lower(email) = $1 limit 1', [email])).rows[0];
        let userId: string = existing?.id;
        let sent: 'invite' | 'access' | 'none' = 'none';
        if (existing) {
          const row = await staffRow(pool, userId);
          if (row && row.status !== 'removed') throw new HttpError(409, row.status === 'invited' ? 'That person already has an invite. Resend it instead.' : 'That person is already on the team.');
        } else {
          // New to BarkFind: Supabase creates the account and sends its invite email (template: Invite user).
          const u = await authAdmin('/invite?redirect_to=' + encodeURIComponent(ctx.hqUrl), 'POST', { email, data: { full_name: name } });
          userId = u.id || u.user?.id;
          if (!userId) throw new HttpError(502, 'Supabase did not create the invite. Try again.');
          sent = 'invite';
        }
        const out = await writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await staffRow(c, userId);
          await c.query(
            `insert into public.hq_staff (user_id, email, display_name, level, status, grants, denies, invited_by, invited_at, accepted_at, removed_at, removed_by, updated_at)
             values ($1, $2, $3, $4, 'invited', '{}', '{}', $5, now(), null, null, null, now())
             on conflict (user_id) do update set email = excluded.email, display_name = excluded.display_name, level = excluded.level, status = 'invited',
               grants = '{}', denies = '{}', invited_by = excluded.invited_by, invited_at = now(), accepted_at = null, removed_at = null, removed_by = null, updated_at = now()`,
            [userId, email, name, level, ctx.staff.userId]);
          const after = await staffRow(c, userId);
          await audit({ action: 'team_invite', entity: 'hq_staff', entityId: userId, detail: `Invited ${email} as ${level}`, before, after });
          return { ok: true };
        });
        if (existing) sent = (await accessEmail(email, name, level, ctx.hqUrl)) ? 'access' : 'none';
        return { ...out, message: sent === 'invite' ? 'Invite sent. The link in the email works for 1 hour. If it runs out, tap Resend invite.' : sent === 'access' ? 'They already have a BarkFind account, so they have been emailed to sign in to HQ.' : 'Added, but the email did not send. Tell them to sign in at barkfind.com/hq.' };
      },
    },
    team_resend: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        const userId = uuid(only(a, ['user_id']).user_id);
        const row = await staffRow(pool, userId);
        if (!row || row.status !== 'invited') throw new HttpError(409, 'Only a pending invite can be resent.');
        canTouch(ctx, row);
        const u = (await pool.query("select email_confirmed_at, last_sign_in_at, coalesce(encrypted_password, '') <> '' as has_password from auth.users where id = $1", [userId])).rows[0];
        let ok = false, kind = 'access';
        if (u && !u.email_confirmed_at && !u.last_sign_in_at) { await authAdmin('/invite?redirect_to=' + encodeURIComponent(ctx.hqUrl), 'POST', { email: row.email }); ok = true; kind = 'invite'; }
        else if (u && !u.has_password) { await authAdmin('/recover?redirect_to=' + encodeURIComponent(ctx.hqUrl), 'POST', { email: row.email }); ok = true; kind = 'password'; }
        else ok = await accessEmail(row.email, row.display_name, row.level, ctx.hqUrl);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          await c.query('update public.hq_staff set invited_at = now(), updated_at = now() where user_id = $1', [userId]);
          await audit({ action: 'team_resend', entity: 'hq_staff', entityId: userId, detail: `Resent invite to ${row.email}`, before: row, after: await staffRow(c, userId) });
          return { ok: true, message: !ok ? 'The invite was kept open, but the email did not send.' : kind === 'invite' ? 'Invite resent. The new link works for 1 hour.' : kind === 'password' ? 'They have not chosen a password yet, so they have been sent a link to choose one. It works for 1 hour.' : 'They already have a password, so they have been emailed to sign in to HQ.' };
        });
      },
    },
    team_cancel: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        const userId = uuid(only(a, ['user_id']).user_id);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await staffRow(c, userId);
          if (!before || before.status !== 'invited') throw new HttpError(409, 'Only a pending invite can be cancelled.');
          canTouch(ctx, before);
          await c.query("update public.hq_staff set status = 'removed', removed_at = now(), removed_by = $2, updated_at = now() where user_id = $1", [userId, ctx.staff.userId]);
          await signOutEverywhere(c, userId);
          await audit({ action: 'team_cancel', entity: 'hq_staff', entityId: userId, detail: `Cancelled invite for ${before.email}`, before, after: await staffRow(c, userId) });
          return { ok: true, message: 'Invite cancelled.' };
        });
      },
    },
    team_set_level: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['user_id', 'level', 'password']);
        const level = oneOf(a.level, LEVELS) as Level;
        return change('Changed level', 'team_set_level', a, ctx, async (c, t) => {
          canTouch(ctx, t, level);
          if (t.level === 'owner' && level !== 'owner') await notLastOwner(c, t);
          await c.query('update public.hq_staff set level = $2 where user_id = $1', [t.user_id, level]);
          return { message: `Level changed to ${level}.` };
        });
      },
    },
    team_set_perms: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['user_id', 'grants', 'denies', 'password']);
        if (ctx.staff.level !== 'owner') throw new HttpError(403, 'Only an owner can add or remove single permissions.');
        const grants = permList(a.grants), denies = permList(a.denies);
        return change('Changed permissions', 'team_set_perms', a, ctx, async (c, t) => {
          canTouch(ctx, t);
          await c.query('update public.hq_staff set grants = $2::text[], denies = $3::text[] where user_id = $1', [t.user_id, grants, denies]);
          return { message: 'Permissions saved.' };
        });
      },
    },
    team_suspend: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['user_id', 'password']);
        return change('Suspended', 'team_suspend', a, ctx, async (c, t) => {
          canTouch(ctx, t);
          if (t.status !== 'active') throw new HttpError(409, 'Only an active member can be suspended.');
          await notLastOwner(c, t);
          await c.query("update public.hq_staff set status = 'suspended' where user_id = $1", [t.user_id]);
          return { message: 'Suspended and signed out everywhere.', signOut: true };
        });
      },
    },
    team_reinstate: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['user_id', 'password']);
        return change('Reinstated', 'team_reinstate', a, ctx, async (c, t) => {
          canTouch(ctx, t);
          if (t.status !== 'suspended') throw new HttpError(409, 'Only a suspended member can be reinstated.');
          await c.query("update public.hq_staff set status = 'active' where user_id = $1", [t.user_id]);
          return { message: 'Reinstated.' };
        });
      },
    },
    team_remove: {
      perm: 'staff_manage',
      run: async (a, ctx) => {
        only(a, ['user_id', 'password']);
        return change('Removed', 'team_remove', a, ctx, async (c, t) => {
          canTouch(ctx, t);
          if (t.status === 'removed') throw new HttpError(409, 'That person has already been removed.');
          await notLastOwner(c, t);
          await c.query("update public.hq_staff set status = 'removed', removed_at = now(), removed_by = $2 where user_id = $1", [t.user_id, ctx.staff.userId]);
          return { message: 'Removed and signed out everywhere.', signOut: true };
        });
      },
    },
    // Sign-in activity comes from auth.sessions (auth.audit_log_entries is empty on this
    // project). Failed code attempts are code challenges that were never verified.
    team_activity: {
      perm: 'staff_manage',
      run: async (a) => {
        only(a, []);
        const r = await pool.query(
          `select s.user_id, s.display_name, s.email, s.level, s.status, s.last_seen_at,
                  exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.factor_type = 'totp' and f.status = 'verified') as mfa,
                  (select count(*)::int from auth.mfa_challenges ch join auth.mfa_factors f on f.id = ch.factor_id
                    where f.user_id = s.user_id and ch.verified_at is null and ch.created_at > now() - interval '30 days') as unverified_codes_30d,
                  (select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
                     select se.created_at, coalesce(se.refreshed_at::timestamptz, se.updated_at) as last_used, se.aal::text as aal, left(se.user_agent, 120) as user_agent, host(se.ip) as ip
                       from auth.sessions se where se.user_id = s.user_id order by se.created_at desc limit 8) x) as sessions
             from public.hq_staff s where s.status <> 'removed'
            order by array_position(array['owner','admin','moderator','support','viewer'], s.level), s.display_name`);
        return { data: r.rows };
      },
    },

    // ---------- My account (every member of staff) ----------
    account_get: {
      perm: null,
      run: async (a, ctx) => {
        only(a, []);
        const [row, mfa, acts] = await Promise.all([
          staffRow(pool, ctx.staff.userId),
          pool.query("select id, created_at, updated_at from auth.mfa_factors where user_id = $1 and factor_type = 'totp' and status = 'verified'", [ctx.staff.userId]),
          pool.query('select created_at, action, entity, detail from public.admin_audit where actor_user_id = $1 order by created_at desc limit 40', [ctx.staff.userId]),
        ]);
        return { data: { name: row?.display_name || '', email: ctx.staff.email, level: ctx.staff.level, alert_email: row?.alert_email ?? null, alert_push: row?.alert_push ?? null, mfa: mfa.rows, activity: acts.rows } };
      },
    },
    account_name: {
      perm: null,
      run: async (a, ctx) => {
        const name = str(only(a, ['name']).name, 80, { min: 1 });
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = await staffRow(c, ctx.staff.userId);
          await c.query('update public.hq_staff set display_name = $2, updated_at = now() where user_id = $1', [ctx.staff.userId, name]);
          await audit({ action: 'account_name', entity: 'hq_staff', entityId: ctx.staff.userId, detail: 'Changed own name', before, after: await staffRow(c, ctx.staff.userId) });
          return { ok: true, message: 'Name saved.' };
        });
      },
    },
    account_password: {
      perm: null,
      run: async (a, ctx) => {
        only(a, ['current', 'next']);
        const next = typeof a.next === 'string' ? a.next : '';
        if (next.length < 12 || next.length > 128) throw new HttpError(400, 'Use at least 12 characters.');
        await requirePassword(pool, ctx, a.current);
        await authAdmin('/admin/users/' + ctx.staff.userId, 'PUT', { password: next });
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          await audit({ action: 'account_password', entity: 'auth.users', entityId: ctx.staff.userId, detail: 'Changed own password' });
          return { ok: true, message: 'Password changed.' };
        });
      },
    },
    account_signout_all: {
      perm: null,
      run: async (a, ctx) => {
        only(a, []);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const n = await signOutEverywhere(c, ctx.staff.userId);
          await audit({ action: 'account_signout_all', entity: 'auth.sessions', entityId: ctx.staff.userId, detail: `Signed out everywhere (${n} session${n === 1 ? '' : 's'})` });
          return { ok: true, message: 'Signed out everywhere.' };
        });
      },
    },
    // New phone: your password here, plus a code the page has just verified (the token's
    // amr shows a totp check in the last 10 minutes). The old authenticator is removed and
    // the page then sets up a new one.
    account_mfa_reset: {
      perm: null,
      run: async (a, ctx) => {
        only(a, ['password']);
        let fresh = false;
        try {
          const amr = JSON.parse(Buffer.from(ctx.token.split('.')[1], 'base64url').toString()).amr || [];
          fresh = amr.some((m: any) => m && m.method === 'totp' && Date.now() / 1000 - Number(m.timestamp) < 600);
        } catch { fresh = false; }
        if (!fresh) throw new HttpError(403, 'Enter a current 6-digit code first.');
        await requirePassword(pool, ctx, a.password);
        const f = await pool.query("select id from auth.mfa_factors where user_id = $1 and factor_type = 'totp'", [ctx.staff.userId]);
        for (const row of f.rows) await authAdmin(`/admin/users/${ctx.staff.userId}/factors/${row.id}`, 'DELETE');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          await audit({ action: 'account_mfa_reset', entity: 'auth.mfa_factors', entityId: ctx.staff.userId, detail: `Removed ${f.rows.length} authenticator(s) to set up a new phone` });
          return { ok: true, message: 'Old authenticator removed. Set up the new one now.' };
        });
      },
    },
  };
}
