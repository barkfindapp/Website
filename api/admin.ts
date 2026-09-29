// /api/admin — gated SQL proxy for the BarkFind admin console.
// Flow: browser sends the user's Supabase access token + a SQL string. We verify the
// token, confirm the user has the 'admin' role in public.user_roles and has completed the
// second sign-in step (aal2), and only then run
// the query against Postgres with a server-side connection. Privileged creds never touch
// the browser; admin access is enforced here (not just in the UI).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { requireAdmin, tokenAal } from './_lib/admin-auth.js';

// Postgres connection string (Supabase → Settings → Database → Connection string → URI).
// Use the pooled "Session"/"Transaction" URI with the DB password. Server-side only.
const DB_URL = process.env.SUPABASE_DB_URL!;

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 3 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    // Same admin check as before (shared helper), plus the second sign-in step.
    const gate = await requireAdmin(req, pool);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.status === 401 ? 'Not signed in' : 'Not authorised' });
    if (tokenAal(req) !== 'aal2') return res.status(401).json({ error: 'Enter your 6-digit code', code: 'mfa' });

    // Run the query. Multi-statement mutations return the last result set (usually empty).
    const sql = (req.body && req.body.sql);
    if (!sql || typeof sql !== 'string') return res.status(400).json({ error: 'sql (string) required' });
    const r: any = await pool.query(sql);
    const rows = Array.isArray(r) ? (r[r.length - 1]?.rows || []) : (r.rows || []);
    return res.status(200).json({ rows });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
