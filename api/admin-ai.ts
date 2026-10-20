// /api/admin-ai: retired on 20 October 2026, with the old /admin console. Everything it did now
// goes through /api/hq, which checks staff permissions, the second sign-in step and audits
// every change. Every request gets 410 Gone and no other detail.
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(410).json({ error: 'Retired. Use HQ.' });
}
