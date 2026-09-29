// /api/admin-ai — gated Claude proxy for the admin console's AI-draft features.
// Same auth gate as /api/admin (valid session + admin role + second sign-in step), then calls Anthropic.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { requireAdmin, tokenAal } from './_lib/admin-auth.js';

const DB_URL = process.env.SUPABASE_DB_URL!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, max: 2 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    // Same admin check as before (shared helper), plus the second sign-in step.
    const gate = await requireAdmin(req, pool);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.status === 401 ? 'Not signed in' : 'Not authorised' });
    if (tokenAal(req) !== 'aal2') return res.status(401).json({ error: 'Enter your 6-digit code', code: 'mfa' });

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
