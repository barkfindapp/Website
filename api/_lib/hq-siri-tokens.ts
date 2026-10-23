// Personal access tokens for "Hey Siri, Ask Ralphy" (public.hq_personal_tokens, made by the
// project chat; RLS on, no client grants). A Siri Shortcut cannot sign in or enter a 6-digit
// code, so it sends a token instead, and that token can only ask Ralphy (api/hq-siri.ts).
// The token is 32 random bytes, base64url, prefixed bfr_. Only its sha256 (hex) and its last
// 4 characters are stored; it is shown once, never logged and never written to the audit.
// One live token per person: making a new one revokes the old one.
import type { Pool } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { HttpError, only, writeTx } from './hq-core.js';
import { effectivePerms, asLevel, type Staff } from './hq-staff.js';
import type { Op } from './hq-act.js';

export const TOKEN_RE = /^bfr_[A-Za-z0-9_-]{43}$/;
export const hashToken = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const LIVE = 'id, label, token_hint as hint, created_at, last_used_at, use_count';

// The Siri route's check. Null for anything that should not work: a malformed token, an unknown
// or revoked one, staff who are not active, or who no longer have ask_ralphy. The caller gives
// the same answer for all of them.
export async function staffForToken(pool: Pool, token: string): Promise<{ tokenId: string; staff: Staff } | null> {
  if (!TOKEN_RE.test(token)) return null;
  const r = (await pool.query(
    `select t.id as token_id, s.user_id, s.email, s.display_name, s.level, s.status, s.grants, s.denies
       from public.hq_personal_tokens t join public.hq_staff s on s.user_id = t.user_id
      where t.token_hash = $1 and t.revoked_at is null`, [hashToken(token)])).rows[0];
  if (!r || r.status !== 'active') return null;
  const perms = effectivePerms(r.level, r.grants, r.denies);
  if (!perms.has('ask_ralphy')) return null;
  return { tokenId: r.token_id, staff: { userId: r.user_id, email: r.email || '', name: r.display_name || '', level: asLevel(r.level), perms, status: r.status, inviteExpired: false } };
}

export function siriTokenOps(pool: Pool): Record<string, Op> {
  return {
    // My account, Siri access: the live token, if any (never the token itself).
    siri_token_get: {
      perm: 'ask_ralphy',
      run: async (a, ctx) => {
        only(a, []);
        const row = (await pool.query(`select ${LIVE} from public.hq_personal_tokens where user_id = $1 and revoked_at is null order by created_at desc limit 1`, [ctx.staff.userId])).rows[0] || null;
        return { data: { token: row } };
      },
    },
    // Every /api/hq op already needs the second sign-in step (aal2), so this does too.
    siri_token_create: {
      perm: 'ask_ralphy',
      run: async (a, ctx) => {
        only(a, []);
        const token = 'bfr_' + randomBytes(32).toString('base64url');
        const hint = token.slice(-4);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const old = (await c.query(
            'update public.hq_personal_tokens set revoked_at = now() where user_id = $1 and revoked_at is null returning id, token_hint as hint', [ctx.staff.userId])).rows;
          const row = (await c.query(
            `insert into public.hq_personal_tokens (user_id, label, token_hash, token_hint) values ($1, 'Siri', $2, $3) returning ${LIVE}`,
            [ctx.staff.userId, hashToken(token), hint])).rows[0];
          await audit({ action: 'siri_token_create', entity: 'hq_personal_tokens', entityId: row.id,
            detail: `Made a Siri token ending ${hint}${old.length ? ` (the one ending ${old.map((o: any) => o.hint).join(', ')} no longer works)` : ''}`,
            before: { live: old }, after: { id: row.id, label: row.label, hint } });
          return { ok: true, token, data: row, message: 'Copy this now. HQ won\'t show it again.' };
        });
      },
    },
    siri_token_revoke: {
      perm: 'ask_ralphy',
      run: async (a, ctx) => {
        only(a, []);
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const old = (await c.query(
            `update public.hq_personal_tokens set revoked_at = now() where user_id = $1 and revoked_at is null returning ${LIVE}`, [ctx.staff.userId])).rows;
          if (!old.length) throw new HttpError(404, 'You have no Siri token to revoke.');
          await audit({ action: 'siri_token_revoke', entity: 'hq_personal_tokens', entityId: old[0].id,
            detail: `Revoked the Siri token ending ${old.map((o: any) => o.hint).join(', ')}`, before: { live: old }, after: { live: [] } });
          return { ok: true, message: 'Revoked. That token no longer works.' };
        });
      },
    },
  };
}
