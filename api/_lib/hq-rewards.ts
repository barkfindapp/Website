// Phase 2: Rewards, read only (as /admin's Rewards tab, which writes nothing): promo codes,
// treat claims by tier and status, and the review milestones. Customer names show with
// users_view (the op's permission); emails are never included.
import type { Pool } from 'pg';
import { only } from './hq-core.js';
import type { Op } from './hq-act.js';

export function rewardOps(pool: Pool): Record<string, Op> {
  return {
    rewards_summary: {
      perm: 'users_view',
      run: async (a) => {
        only(a, []);
        const [tiles, codes, tiers, recent] = await Promise.all([
          pool.query(`select
              (select count(*)::int from public.promo_codes) as codes,
              (select count(*)::int from public.promo_codes where claimed_by is not null) as codes_claimed,
              (select count(*)::int from public.treat_claims) as treats,
              (select count(*)::int from public.treat_claims where status = 'pending') as treats_pending,
              (select count(*)::int from public.treat_claims where status = 'fulfilled') as treats_fulfilled,
              (select count(*)::int from public.profiles where milestone_10_claimed) as m10,
              (select count(*)::int from public.profiles where milestone_20_claimed) as m20,
              (select count(*)::int from public.profiles where milestone_50_claimed) as m50`),
          pool.query(`select c.code, c.milestone, c.discount_percent, c.platform, c.created_at, c.claimed_at, c.claimed_by,
                             p.full_name as claimed_by_name
                        from public.promo_codes c left join public.profiles p on p.user_id = c.claimed_by
                       order by c.created_at desc limit 100`),
          pool.query(`select tier, sum(n)::int as total, jsonb_object_agg(status, n) as by_status
                        from (select tier, coalesce(status, 'unknown') as status, count(*)::int as n from public.treat_claims group by 1, 2) x
                       group by tier order by total desc, tier`),
          pool.query(`select t.id, t.tier, t.status, t.points_at_claim, t.plan_at_claim, t.claimed_at, t.fulfilled_at, t.fulfilment_method,
                             left(t.failure_reason, 200) as failure_reason, t.user_id, p.full_name
                        from public.treat_claims t left join public.profiles p on p.user_id = t.user_id
                       order by t.claimed_at desc nulls last limit 20`),
        ]);
        return { data: { tiles: tiles.rows[0], codes: codes.rows, tiers: tiers.rows, recent: recent.rows } };
      },
    },
  };
}
