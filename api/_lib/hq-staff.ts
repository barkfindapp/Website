// HQ access and permissions. HQ access comes from public.hq_staff only (not
// user_roles): the caller's Supabase session is verified, then their hq_staff row
// must be active. Effective permissions = the level's set + grants - denies.
// Files under api/_lib are not deployed as functions (leading underscore).
import type { VercelRequest } from '@vercel/node';
import type { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

export const PERMISSIONS = [
  'today', 'ask_ralphy', 'money', 'insights', 'reviews', 'reports', 'safety', 'privacy', 'claims',
  'support_read', 'support_reply', 'support_assign', 'users_view', 'users_contact', 'users_ban', 'places_edit', 'places_moderate', 'places_delete', 'content',
  'announce', 'outreach', 'renewals', 'audit_view', 'trash_restore', 'staff_manage', 'staff_admins',
] as const;
export type Perm = typeof PERMISSIONS[number];
export const LEVELS = ['owner', 'admin', 'moderator', 'support', 'viewer'] as const;
export type Level = typeof LEVELS[number];

const ALL = [...PERMISSIONS] as Perm[];
const LEVEL_PERMS: Record<Level, Perm[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== 'staff_admins'),
  moderator: ['today', 'insights', 'reviews', 'reports', 'claims', 'users_view', 'places_edit', 'places_moderate'],
  support: ['today', 'support_read', 'support_reply', 'support_assign', 'users_view', 'users_contact'],
  viewer: ['today', 'money', 'insights'],
};

export function effectivePerms(level: string, grants: unknown, denies: unknown): Set<Perm> {
  const valid = (a: unknown) => (Array.isArray(a) ? a.filter((p): p is Perm => (PERMISSIONS as readonly string[]).includes(p)) : []);
  const set = new Set<Perm>(LEVEL_PERMS[level as Level] || []);
  for (const p of valid(grants)) set.add(p);
  for (const p of valid(denies)) set.delete(p);
  return set;
}

export type Staff = { userId: string; email: string; name: string; level: Level; perms: Set<Perm>; status: string; inviteExpired: boolean };
export type StaffCheck = { ok: true; staff: Staff } | { ok: false; status: 401 | 403 };

export async function requireStaff(req: VercelRequest, pool: Pool): Promise<StaffCheck> {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false, status: 401 };

  // 1. Verify the caller's session with Supabase.
  const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) return { ok: false, status: 401 };

  // 2. An active hq_staff row, and last_seen_at at most every 5 minutes.
  const r = await pool.query(
    "select email, display_name, level, status, grants, denies, (status = 'invited' and invited_at < now() - interval '7 days') as invite_expired from public.hq_staff where user_id = $1",
    [data.user.id],
  );
  const row = r.rows[0];
  // A pending invite passes here only so it can be accepted after the second sign-in step (see /api/hq).
  if (!row || (row.status !== 'active' && row.status !== 'invited')) return { ok: false, status: 403 };
  try {
    await pool.query(
      "update public.hq_staff set last_seen_at = now() where user_id = $1 and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')",
      [data.user.id],
    );
  } catch { /* last_seen_at is best effort; never block access on it */ }

  return {
    ok: true,
    staff: {
      userId: data.user.id, email: row.email || data.user.email || '', name: row.display_name || '',
      level: row.level, perms: effectivePerms(row.level, row.grants, row.denies), status: row.status, inviteExpired: !!row.invite_expired,
    },
  };
}
