// Phase 3: Insights and Money, read only.
// insights: places, data quality, new places per week, reviews and AI agreement, app use,
//   searches (top and with no matching place) and devices, from /admin's Analytics and
//   Overview. One op, cached for 5 minutes per server instance (the places summary reads
//   every place and takes a few seconds).
// money: subscriptions per month and by plan, the stored RevenueCat snapshot (production
//   revenue only), Anthropic spend per day for 30 days, Google's real monthly total from
//   google_spend_this_month (after free allowances, with VAT), and spend by operation, where
//   Google calls are at list price before free allowances. Figures stay in US dollars here;
//   the page shows them in pounds with the day's rate.
import type { Pool } from 'pg';
import { only } from './hq-core.js';
import { usdToGbp } from './hq-fx.js';
import type { Op } from './hq-act.js';

const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; data: unknown } | null = null;

async function buildInsights(pool: Pool) {
  const [places, cats, weeks, reviews, use, days, top, gaps, devices] = await Promise.all([
    pool.query(`select count(*)::int as total, count(*) filter (where not flagged)::int as live, count(*) filter (where flagged)::int as hidden,
        count(*) filter (where is_verified and not flagged)::int as verified,
        count(*) filter (where google_verified and not flagged)::int as google_verified,
        count(*) filter (where barkfind_verified and not flagged)::int as barkfind_verified,
        count(*) filter (where not flagged and coalesce(array_length(amenities, 1), 0) > 0)::int as with_amenities,
        round(avg(barkfind_rating) filter (where barkfind_rating > 0 and not flagged)::numeric, 2) as avg_rating,
        count(*) filter (where not flagged and coalesce(image_url, '') = '')::int as no_photo,
        count(*) filter (where not flagged and coalesce(description, '') = '')::int as no_summary,
        count(*) filter (where not flagged and opening_hours is null)::int as no_hours,
        count(*) filter (where not flagged and (extra_data->>'google_last_synced') is not null
                         and (extra_data->>'google_last_synced')::timestamptz < now() - interval '30 days')::int as google_stale
      from public.locations`),
    pool.query(`select category, count(*)::int as n from public.locations where not flagged group by 1 order by 2 desc`),
    pool.query(`select to_char(w.wk, 'YYYY-MM-DD') as week, (select count(*)::int from public.locations l where l.created_at >= w.wk and l.created_at < w.wk + interval '1 week') as n
      from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') as w(wk) order by w.wk`),
    pool.query(`select (select coalesce(jsonb_object_agg(status, n), '{}') from (select status::text, count(*)::int as n from public.reviews group by 1) s) as by_status,
        (select count(*)::int from public.moderation_log) as decisions,
        (select round(100.0 * avg(case when agreed then 1 else 0 end))::int from public.moderation_log where agreed is not null) as ai_agreement_pct`),
    pool.query(`select count(distinct user_id) filter (where started_at >= now() - interval '1 day')::int as dau,
        count(distinct user_id) filter (where started_at >= now() - interval '7 days')::int as wau,
        count(distinct user_id) filter (where started_at >= now() - interval '30 days')::int as mau,
        count(*)::int as sessions, coalesce(sum(search_count), 0)::int as searches from public.session_analytics`),
    pool.query(`select to_char(d.day, 'YYYY-MM-DD') as day, (select count(distinct s.user_id)::int from public.session_analytics s where s.started_at >= d.day and s.started_at < d.day + interval '1 day') as n
      from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d(day) order by d.day`),
    pool.query(`select lower(trim(term)) as term, count(*)::int as n from public.search_logs where term is not null and length(trim(term)) > 1 group by 1 order by 2 desc, 1 limit 20`),
    // Searches in the last 30 days that no live place answers. A place answers a search when the
    // search is in its name, category or address, or its name (4+ characters) appears in the
    // search as whole words, so "revo kitchen weston" is answered by "Revo Kitchen".
    pool.query(`with t as (select lower(trim(term)) as term, count(*)::int as n, max(searched_at) as last_at
                             from public.search_logs
                            where term is not null and length(trim(term)) > 1 and searched_at >= now() - interval '30 days' group by 1)
      select t.term, t.n, t.last_at from t where not exists (select 1 from public.locations l where not l.flagged
        and (l.name ilike '%' || t.term || '%' or l.category ilike '%' || t.term || '%' or l.address ilike '%' || t.term || '%'
             or (length(trim(l.name)) >= 4 and (' ' || t.term || ' ') like ('% ' || lower(trim(l.name)) || ' %'))))
      order by t.last_at desc, t.term limit 20`),
    pool.query(`select coalesce(device_info->>'platform', device_info->>'os', device_info->>'model', 'unknown') as device, count(*)::int as n
      from public.session_analytics group by 1 order by 2 desc limit 10`),
  ]);
  return {
    places: places.rows[0], categories: cats.rows, new_per_week: weeks.rows, reviews: reviews.rows[0],
    use: use.rows[0], active_per_day: days.rows, top_searches: top.rows, unmatched_searches: gaps.rows, devices: devices.rows,
    taken_at: new Date().toISOString(),
  };
}

export function insightOps(pool: Pool): Record<string, Op> {
  return {
    insights: {
      perm: 'insights',
      run: async (a) => {
        only(a, ['fresh']);
        const fresh = a.fresh === true;
        if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return { data: cached.data, cached: true };
        const data = await buildInsights(pool);
        cached = { at: Date.now(), data };
        return { data, cached: false };
      },
    },

    money: {
      perm: 'money',
      run: async (a) => {
        only(a, []);
        const [months, plans, rc, daily, totals, google, ops, fx] = await Promise.all([
          pool.query(`select to_char(m.mo, 'YYYY-MM') as month, (select count(*)::int from public.subscriptions s where s.created_at >= m.mo and s.created_at < m.mo + interval '1 month') as n
            from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') as m(mo) order by m.mo`),
          pool.query(`select coalesce(plan, '–') as plan, coalesce(status, '–') as status, coalesce(store, '–') as store, count(*)::int as n
            from public.subscriptions group by 1, 2, 3 order by 4 desc, 1, 2`),
          pool.query('select metrics, synced_at from public.revenuecat_snapshot where id = 1'),
          pool.query(`select to_char(d.day, 'YYYY-MM-DD') as day,
              (select coalesce(sum(cost_usd), 0)::float from public.api_usage u where u.provider = 'anthropic' and u.created_at >= d.day and u.created_at < d.day + interval '1 day') as usd
            from generate_series(date_trunc('day', now()) - interval '29 days', date_trunc('day', now()), interval '1 day') as d(day) order by d.day`),
          pool.query(`select coalesce(sum(cost_usd) filter (where created_at >= date_trunc('day', now())), 0)::float as today,
              coalesce(sum(cost_usd) filter (where created_at >= now() - interval '7 days'), 0)::float as d7,
              coalesce(sum(cost_usd) filter (where created_at >= now() - interval '30 days'), 0)::float as d30,
              coalesce(sum(cost_usd), 0)::float as all_time
            from public.api_usage where provider = 'anthropic'`),
          pool.query('select sku, operations, calls::int, free_calls::int, chargeable_calls::int, usd_ex_vat::float, usd_inc_vat::float from public.google_spend_this_month order by usd_inc_vat desc, calls desc'),
          pool.query(`select provider, operation, count(*)::int as calls, coalesce(sum(cost_usd), 0)::float as usd
            from public.api_usage where created_at >= now() - interval '30 days' group by 1, 2 order by 4 desc, 3 desc limit 40`),
          usdToGbp(pool),
        ]);
        // Revenue: production only (revenue_usd adds up sandbox purchases too).
        const snap = rc.rows[0] || null;
        let revenuecat = null;
        if (snap) {
          const { revenue_usd, revenue_usd_production, ...m } = snap.metrics || {};
          revenuecat = { synced_at: snap.synced_at, metrics: { ...m, revenue_usd: revenue_usd_production || null } };
        }
        const g = google.rows;
        return { data: {
          subscriptions_per_month: months.rows, subscriptions_by_plan: plans.rows, revenuecat,
          anthropic_per_day: daily.rows, anthropic_totals: totals.rows[0],
          google_month: { rows: g, usd_ex_vat: g.reduce((s, r) => s + (r.usd_ex_vat || 0), 0), usd_inc_vat: g.reduce((s, r) => s + (r.usd_inc_vat || 0), 0) },
          by_operation: ops.rows, fx,
        } };
      },
    },
  };
}
