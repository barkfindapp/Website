// /api/admin — gated SQL proxy for the BarkFind admin console.
// Flow: browser sends the user's Supabase access token + a SQL string. We verify the
// token, confirm the user has the 'admin' role in public.user_roles, and only then run
// the query against Postgres with a server-side connection. Privileged creds never touch
// the browser; admin access is enforced here (not just in the UI).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
// Postgres connection string (Supabase → Settings → Database → Connection string → URI).
// Use the pooled "Session"/"Transaction" URI with the DB password. Server-side only.
const DB_URL = process.env.SUPABASE_DB_URL!;

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in' });

    // 1. Verify the caller's session.
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user }, error: authErr } = await supa.auth.getUser();
    if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session' });

    // 2. Confirm admin role.
    const roleRes = await pool.query("select 1 from public.user_roles where user_id=$1 and role='admin' limit 1", [user.id]);
    if (!roleRes.rows.length) return res.status(403).json({ error: 'Not authorised (admin role required)' });

    // 3. Run the query. Multi-statement mutations return the last result set (usually empty).
    const sql = (req.body && req.body.sql);
    if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'sql (string) required' });
    const r: any = await pool.query(sql);
    const rows = Array.isArray(r) ? (r[r.length - 1]?.rows || []) : (r.rows || []);
    return res.status(200).json({ rows });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
