// POST /api/hq-siri: "Hey Siri, Ask Ralphy". A Siri Shortcut sends a personal access token
// (Authorization: Bearer bfr_..., made in HQ, My account) and {"question": "..."}; Siri reads
// the answer aloud. The token can only do this: it runs ralphyAnswer, exactly what the ask op
// runs, with that person's permissions, and reaches no other op. Every reply is {"answer": ...}
// in words Siri can speak. The token and the question are never logged.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import { runtimeDbUrl, POOL_OPTS } from './_lib/db-url.js';
import { staffForToken } from './_lib/hq-siri-tokens.js';
import { ralphyAnswer } from './hq.js';
import type { Ctx } from './_lib/hq-act.js';

const pool = new Pool({ connectionString: runtimeDbUrl(process.env.SUPABASE_DB_URL), ...POOL_OPTS, max: 1 });
// Per token. Exported so a test can lower them.
export const LIMITS = { hour: 20, day: 100, timeoutMs: 25000 };
export const SAY = {
  badToken: "That token doesn't work. Make a new one in HQ, My account.",
  noQuestion: "I didn't catch a question. Try asking again.",
  tooLong: 'That question was too long for me. Try a shorter one.',
  limit: "That's enough questions for now. Try again later.",
  failed: "Ralphy couldn't answer just now. Try again in a minute.",
};

// Whatever markdown the model leaves in, gone, so Siri does not read out symbols.
export function spoken(t: string): string {
  const flat = String(t)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\u2013\u2014]/g, ', ');
  // Headings and list items become sentences of their own, so they do not run together.
  return flat.split(/\n+/)
    .map((l) => l.replace(/^\s{0,3}(#{1,6}|>|[-*+•]|\d+[.)])\s+/, '').replace(/[*_`~#|]/g, '').replace(/\s{2,}/g, ' ').trim())
    .filter(Boolean)
    .map((l) => (/[.?!:,;]$/.test(l) ? l : l + '.'))
    .join(' ')
    .replace(/\s+([.,;:?!])/g, '$1')
    .trim();
}

function bodyOf(req: VercelRequest): any {
  const b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  try { return JSON.parse(Buffer.isBuffer(b) ? b.toString('utf8') : String(b ?? '')); } catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const say = (code: number, answer: string) => res.status(code).json({ answer });
  if (req.method !== 'POST') return say(405, 'Send the question with POST.');
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const who = await staffForToken(pool, token);
    if (!who) return say(401, SAY.badToken);

    const raw = bodyOf(req);
    const q = raw && typeof raw.question === 'string' ? raw.question.replace(/\s+/g, ' ').trim() : '';
    if (q.length < 2) return say(400, SAY.noQuestion);
    if (q.length > 300) return say(400, SAY.tooLong);

    // This token's Siri answers in the last hour and day (the metered calls in api_usage).
    const used = (await pool.query(
      `select count(*) filter (where created_at > now() - interval '1 hour')::int as hour, count(*)::int as day
         from public.api_usage where operation = 'hq_ask' and meta->>'source' = 'siri' and meta->>'token_id' = $1
          and created_at > now() - interval '1 day'`, [who.tokenId])).rows[0];
    if (used.hour >= LIMITS.hour || used.day >= LIMITS.day) return say(429, SAY.limit);

    await pool.query('update public.hq_personal_tokens set last_used_at = now(), use_count = use_count + 1 where id = $1', [who.tokenId]);
    const ctx: Ctx = { staff: who.staff, token: '', hqUrl: 'https://www.barkfind.com/hq' };
    let text = '';
    try {
      text = (await ralphyAnswer(ctx, q, { siri: { tokenId: who.tokenId, timeoutMs: LIMITS.timeoutMs } })).text;
    } catch (e: any) {
      console.error('hq-siri answer failed', e?.name || '', e?.status || '');
      return say(200, SAY.failed);
    }
    return say(200, spoken(text) || SAY.failed);
  } catch (e: any) {
    console.error('hq-siri', e?.name || '', String(e?.message || '').slice(0, 120));
    return say(200, SAY.failed);
  }
}
