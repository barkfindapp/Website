// US dollars to pounds, for display only. Anthropic, Google and RevenueCat figures stay
// in USD in the database; HQ shows them in GBP at this rate.
//
// The rate comes from Frankfurter (the European Central Bank's reference rates, no key),
// at most once a day. It is kept in memory and in public.app_config (key fx_usd_gbp) so
// the last good rate survives restarts. If a fetch fails, the last good rate is used and
// marked stale.
import type { Pool } from 'pg';

export type Fx = { rate: number; date: string; fetched_at: string; stale: boolean } | null;
const KEY = 'fx_usd_gbp';
const DAY = 24 * 3600 * 1000;
let mem: { rate: number; date: string; fetched_at: string } | null = null;
let triedAt = 0;

function valid(x: any) {
  return x && typeof x.rate === 'number' && x.rate > 0.3 && x.rate < 2 && typeof x.date === 'string' && typeof x.fetched_at === 'string' ? x : null;
}

export async function usdToGbp(pool: Pool): Promise<Fx> {
  const fresh = (x: any) => x && Date.now() - Date.parse(x.fetched_at) < DAY;
  if (fresh(mem)) return { ...mem!, stale: false };
  if (!mem) {
    try {
      const r = await pool.query('select value from public.app_config where key = $1', [KEY]);
      mem = valid(JSON.parse(r.rows[0]?.value || 'null'));
    } catch { /* fall through to a fetch */ }
    if (fresh(mem)) return { ...mem!, stale: false };
  }
  // At most one fetch attempt every 10 minutes per instance, so a Frankfurter outage is not hit on every request.
  if (Date.now() - triedAt > 10 * 60 * 1000) {
    triedAt = Date.now();
    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=GBP', { signal: AbortSignal.timeout(4000) });
      const j: any = await res.json();
      const rate = Number(j?.rates?.GBP);
      const next = valid({ rate, date: String(j?.date || ''), fetched_at: new Date().toISOString() });
      if (res.ok && next) {
        mem = next;
        try {
          await pool.query(
            `insert into public.app_config (key, value, note, updated_at) values ($1, $2, $3, now())
             on conflict (key) do update set value = excluded.value, updated_at = now()`,
            [KEY, JSON.stringify(next), 'USD to GBP for HQ display only (Frankfurter, ECB rates). Written by /api/hq at most once a day.']);
        } catch (e: any) { console.error('hq fx save', e?.message); }
        return { ...next, stale: false };
      }
      console.error('hq fx fetch', res.status, JSON.stringify(j).slice(0, 200));
    } catch (e: any) { console.error('hq fx fetch', e?.message); }
  }
  return mem ? { ...mem, stale: true } : null;
}
