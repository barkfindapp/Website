// Resend webhook for outreach email (www.barkfind.com/api/outreach-resend-webhook), events
// email.bounced and email.complained. Checks Resend's (Svix) signature exactly as the
// support-inbound edge function does, with its own secret (app_secrets.resend_outreach_webhook_secret),
// and refuses anything unsigned or wrongly signed with 401. A bounce or complaint puts the address
// on outreach_suppression and logs an inbound entry against the contact.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Pool } from 'pg';
import { runtimeDbUrl, POOL_OPTS } from './_lib/db-url.js';

const pool = new Pool({ connectionString: runtimeDbUrl(process.env.SUPABASE_DB_URL), ...POOL_OPTS, max: 1 });
// The signature covers the exact bytes Resend sent, so read the body raw.
export const config = { api: { bodyParser: false } };

export function svixValid(secret: string | null, headers: Record<string, unknown>, body: string, nowSec = Date.now() / 1000): boolean {
  if (!secret) return false;
  const id = String(headers['svix-id'] || ''), ts = String(headers['svix-timestamp'] || ''), sig = String(headers['svix-signature'] || '');
  if (!id || !ts || !sig) return false;
  if (!/^\d+$/.test(ts) || Math.abs(nowSec - Number(ts)) > 600) return false;
  const mac = createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return sig.split(' ').some((p) => { const v = p.split(',')[1] || ''; const a = Buffer.from(v), b = Buffer.from(mac); return a.length === b.length && timingSafeEqual(a, b); });
}

const addr = (v: unknown): string => { const s = String(Array.isArray(v) ? v[0] : v || ''); const m = s.match(/<([^>]+)>/); return (m ? m[1] : s).trim().toLowerCase(); };

export async function record(q: { query: Pool['query'] }, evt: any) {
  const kind = evt?.type === 'email.bounced' ? 'bounced' : evt?.type === 'email.complained' ? 'complained' : null;
  if (!kind) return { ignored: evt?.type ?? null };
  const d = evt.data || {};
  const tos: string[] = [...new Set<string>((Array.isArray(d.to) ? d.to : [d.to]).map(addr).filter((x: string) => x.includes('@')))];
  // The contact: by the Resend id HQ logged when it sent, otherwise by address.
  const byId = d.email_id ? (await q.query("select outreach_id from public.hq_outreach_log where provider_id = $1 limit 1", [d.email_id])).rows[0]?.outreach_id : null;
  const contacts = byId ? [byId] : tos.length ? (await q.query('select id from public.hq_outreach where lower(email) = any($1::text[])', [tos])).rows.map((r) => r.id) : [];
  for (const e of tos) await q.query('insert into public.outreach_suppression (email, reason) values ($1, $2) on conflict (email) do nothing', [e, kind]);
  const note = kind === 'bounced'
    ? `Email bounced${d.bounce?.message ? ': ' + String(d.bounce.message).slice(0, 200) : ''}. The address will not be emailed again.`
    : 'Marked an email as spam. The address will not be emailed again.';
  for (const id of contacts) await q.query(`insert into public.hq_outreach_log (outreach_id, note, channel, direction, provider_id) values ($1, $2, 'email', 'in', $3)`, [id, note, d.email_id || null]);
  return { kind, suppressed: tos.length, contacts: contacts.length };
}

async function rawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const ch of req as any) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = await rawBody(req);
    const secret = (await pool.query("select value from public.app_secrets where name = 'resend_outreach_webhook_secret'")).rows[0]?.value ?? null;
    if (!svixValid(secret, req.headers as any, body)) return res.status(401).json({ error: 'bad signature' });
    let evt: any; try { evt = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad json' }); }
    return res.status(200).json({ ok: true, ...(await record(pool, evt)) });
  } catch (e: any) {
    console.error('outreach webhook', e?.message);
    return res.status(500).json({ error: 'failed' });
  }
}
