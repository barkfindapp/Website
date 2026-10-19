// One-click unsubscribe for outreach email (www.barkfind.com/api/outreach-unsubscribe?c=<contact>&t=<sig>).
// Public: no login and no confirmation step. The link carries the contact id and an HMAC over it
// (app_secrets.outreach_unsubscribe_key), never the email address. A valid link puts the
// contact's address on outreach_suppression ('unsubscribed'), logs it against the contact and
// sets them to Declined. GET is a person clicking the link and gets a short page; POST is the
// mail client's one-click unsubscribe (List-Unsubscribe-Post, RFC 8058) and gets an empty 200.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { runtimeDbUrl, POOL_OPTS } from './_lib/db-url.js';
import { unsubValid } from './_lib/outreach-email.js';

const pool = new Pool({ connectionString: runtimeDbUrl(process.env.SUPABASE_DB_URL), ...POOL_OPTS, max: 1 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const page = (title: string, text: string) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${title} | BarkFind</title></head>
<body style="margin:0;background:#FAEFD1;font-family:Arial,Helvetica,sans-serif;color:#212121;"><div style="max-width:520px;margin:12vh auto;padding:28px 24px;background:#fff;border:1px solid #F0E3C2;border-radius:16px;">
<img src="https://www.barkfind.com/barkfind-logo-rust.png" width="84" alt="BarkFind" style="display:block;margin-bottom:18px;"><h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 10px;">${title}</h1><p style="margin:0;line-height:1.55;color:#585858;">${text}</p></div></body></html>`;

export async function unsubscribe(q: { query: Pool['query'] }, contactId: string, token: string): Promise<'ok' | 'bad'> {
  if (!UUID.test(contactId) || !token) return 'bad';
  const key = (await q.query("select value from public.app_secrets where name = 'outreach_unsubscribe_key'")).rows[0]?.value;
  if (!key || !unsubValid(key, contactId, token)) return 'bad';
  const c = (await q.query('select id, email from public.hq_outreach where id = $1', [contactId])).rows[0];
  const email = String(c?.email || '').trim().toLowerCase();
  if (email) await q.query("insert into public.outreach_suppression (email, reason) values ($1, 'unsubscribed') on conflict (email) do nothing", [email]);
  if (c) {
    await q.query(`insert into public.hq_outreach_log (outreach_id, note, channel, direction)
                   values ($1, 'Unsubscribed using the link in an email. Do not contact again.', 'email', 'in')`, [contactId]);
    await q.query(`update public.hq_outreach set status = 'declined', next_follow_up = null, updated_at = now() where id = $1`, [contactId]);
  }
  return 'ok';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).send('');
  const c = String(req.query.c || ''), t = String(req.query.t || '');
  let result: 'ok' | 'bad';
  try { result = await unsubscribe(pool, c, t); } catch (e: any) {
    console.error('outreach unsubscribe', e?.message);
    return req.method === 'POST' ? res.status(500).send('') : res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(page('Something went wrong', 'Please try the link again in a minute, or reply to the email and ask to be removed.'));
  }
  if (req.method === 'POST') return res.status(result === 'ok' ? 200 : 400).send('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (result === 'bad') return res.status(400).send(page('This link is not valid', 'It may have been copied incompletely. Reply to the email and ask to be removed, and we will do it.'));
  return res.status(200).send(page('You are unsubscribed', 'BarkFind will not email you again about this. Thank you for letting us know.'));
}
