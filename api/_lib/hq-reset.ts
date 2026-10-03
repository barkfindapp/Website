// Customers: "Send password reset email" (needs support_reply). Only for accounts that sign in
// with email and a password; Apple, Google-only and guest accounts have no password to reset.
// It calls Supabase's own resetPasswordForEmail, so the customer gets the normal branded reset
// email, and Supabase's own rate limit applies. The audit row never holds the email address.
import type { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { HttpError, only, uuid, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const REDIRECT = 'https://www.barkfind.com/reset-password';

// How someone signs in: "Email", "Apple", "Google", "Email and Google", "Guest". email is true
// when they have an email identity (so a password to reset).
export async function signIn(pool: Pool, userId: string): Promise<{ label: string; email: boolean; address: string | null } | null> {
  const r = (await pool.query(
    `select u.email, coalesce(u.is_anonymous, false) as guest,
            coalesce(array_agg(distinct i.provider order by i.provider) filter (where i.provider is not null), '{}') as providers
       from auth.users u left join auth.identities i on i.user_id = u.id where u.id = $1 group by u.id`, [userId])).rows[0];
  if (!r) return null;
  if (r.guest) return { label: 'Guest', email: false, address: null };
  const names: Record<string, string> = { email: 'Email', apple: 'Apple', google: 'Google' };
  const p: string[] = r.providers;
  return {
    label: p.length ? p.map((x) => names[x] || x).join(' and ') : 'Unknown',
    email: p.includes('email') && !!r.email,
    address: r.email || null,
  };
}

export function resetOps(pool: Pool): Record<string, Op> {
  return {
    user_password_reset: {
      perm: 'support_reply',
      run: async (a, ctx) => {
        const id = uuid(only(a, ['id']).id);
        const s = await signIn(pool, id);
        if (!s) throw new HttpError(404, 'That customer no longer exists.');
        if (!s.email || !s.address) throw new HttpError(409, `This customer signs in with ${s.label}, so there is no password to reset.`);
        return writeTx(pool, ctx.staff.userId, async (_c, audit) => {
          const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
          const { error } = await supa.auth.resetPasswordForEmail(s.address!, { redirectTo: REDIRECT });
          if (error) {
            // Supabase's rate-limit wording ("For security purposes, you can only request this after
            // 45 seconds.") is shown as it is; anything else stays general.
            const status = (error as any).status;
            if (status === 429 || /rate limit|security purposes/i.test(error.message || '')) throw new HttpError(429, String(error.message).slice(0, 200));
            console.error('hq password reset', status, error.message);
            throw new HttpError(502, 'Supabase did not send the reset email. Try again in a minute.');
          }
          await audit({ action: 'user_password_reset', entity: 'profiles', entityId: id, detail: 'Sent a password reset email' });
          return { ok: true, message: 'Password reset email sent. The link in it works for 1 hour.' };
        });
      },
    },
  };
}
