// /api/admin-ai — gated Claude proxy for the admin console's AI-draft features.
// Same auth gate as /api/admin (valid session + admin role), then calls Anthropic.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const DB_URL = process.env.SUPABASE_DB_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 2 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data: { user }, error } = await supa.auth.getUser();
    if (error || !user) return res.status(401).json({ error: 'Invalid session' });
    const rc = await pool.query("select 1 from public.user_roles where user_id=$1 and role='admin' limit 1", [user.id]);
    if (!rc.rows.length) return res.status(403).json({ error: 'Not authorised' });

    if (!ANTHROPIC_API_KEY) return res.status(200).json({ text: '(AI not configured — add ANTHROPIC_API_KEY in Vercel)' });
    const { prompt, data } = (req.body || {});
    const content = String(prompt || '') + (data ? ('\n\nData:\n' + JSON.stringify(data)) : '');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content }] }),
    });
    const j: any = await r.json();
    if (!r.ok) return res.status(502).json({ error: JSON.stringify(j).slice(0, 300) });
    const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
    return res.status(200).json({ text });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
