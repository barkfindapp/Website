// Shared admin gate for the serverless functions. Same check as /api/admin and
// /api/admin-ai: verify the caller's Supabase session with the anon key, then
// confirm the 'admin' role in public.user_roles through the server-side pool.
// Used by /api/admin and /api/admin-ai. /api/hq uses hq-staff.ts instead.
// Files under api/_lib are not deployed as functions (leading underscore).
import type { VercelRequest } from '@vercel/node';
import type { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 };

export async function requireAdmin(req: VercelRequest, pool: Pool): Promise<AdminCheck> {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401 };

  // 1. Verify the caller's session.
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) return { ok: false, status: 401 };

  // 2. Confirm admin role.
  const roleRes = await pool.query(
    "select 1 from public.user_roles where user_id=$1 and role='admin' limit 1",
    [data.user.id],
  );
  if (!roleRes.rows.length) return { ok: false, status: 403 };

  return { ok: true, userId: data.user.id };
}

// The aal claim from a token requireAdmin has already verified with Supabase.
// 'aal2' means the second sign-in step (the 6-digit code) was completed.
export function tokenAal(req: VercelRequest): string | null {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch { return null; }
}
