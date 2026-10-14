// Money, Creator payouts (needs money, not creators: someone can run the creator programme
// without seeing what is paid). The figures come from the creator_payout_months view, worked
// out on the server per creator per UK month (creator terms v2, clauses 1 and 2). A refund in
// a later month comes off that later month, so a month already paid never changes.
// Payments Josh has made are recorded in creator_payments, one per creator per month.
import type { Pool } from 'pg';
import { HttpError, only, uuid, str, date, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';
import { guaranteeInfo } from './hq-creators.js';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (v: unknown, optional = false): string | null => {
  if ((v === undefined || v === null || v === '') && optional) return null;
  if (typeof v !== 'string' || !MONTH_RE.test(v)) throw new HttpError(400, 'Choose a month.');
  return v;
};
// creator_payments is created by a migration applied separately. Until it exists the figures
// still show, and Mark paid says plainly why it cannot save.
const paymentsReady = async (pool: Pool) =>
  !!(await pool.query("select to_regclass('public.creator_payments') is not null as ok")).rows[0]?.ok;

export function payoutOps(pool: Pool): Record<string, Op> {
  return {
    creator_payouts: {
      perm: 'money',
      run: async (a) => {
        only(a, ['month']);
        const asked = month(a.month, true);
        const months = (await pool.query(
          'select month, bool_and(month_closed) as closed from public.creator_payout_months group by month order by month desc')).rows;
        // Default: the last closed month, otherwise the newest one.
        const pick = asked || (months.find((m) => m.closed) || months[0])?.month || null;
        const ready = await paymentsReady(pool);
        const [rows, paid] = pick ? await Promise.all([
          pool.query(
            `select creator_id, display_name, slug, tier, offer_code, code_cap, month, month_closed, redeemed,
                    refunded_same_month, refunded_from_earlier, payable_people, fee_gbp, guarantee_gbp, total_gbp,
                    redeemed_to_date, over_cap
               from public.creator_payout_months where month = $1 order by lower(display_name)`, [pick]),
          ready ? pool.query(
            `select p.creator_id, p.amount_gbp::float as amount_gbp, p.paid_on::text as paid_on, p.reference, p.created_at,
                    coalesce(s.display_name, s.email) as created_by_name
               from public.creator_payments p left join public.hq_staff s on s.user_id = p.created_by where p.month = $1`, [pick])
            : Promise.resolve({ rows: [] }),
        ]) : [{ rows: [] }, { rows: [] }];
        // Active creators whose first-post guarantee is not earned yet (same rule as the view).
        const active = (await pool.query("select id, display_name from public.creators where status = 'active' order by lower(display_name)")).rows;
        const g = await guaranteeInfo(pool, active.map((x) => x.id));
        const notEarned = active.filter((x) => g[x.id] && !g[x.id].guarantee_month)
          .map((x) => ({ creator_id: x.id, display_name: x.display_name, v2: g[x.id].v2, approved_live: g[x.id].approved_live }));
        return { data: { month: pick, months, rows: rows.rows, payments: paid.rows, payments_ready: ready, guarantee_not_earned: notEarned } };
      },
    },

    creator_payment_mark: {
      perm: 'money',
      run: async (a, ctx) => {
        only(a, ['creator_id', 'month', 'amount_gbp', 'paid_on', 'reference']);
        const creatorId = uuid(a.creator_id);
        const m = month(a.month)!;
        const amount = typeof a.amount_gbp === 'number' ? a.amount_gbp : Number(a.amount_gbp);
        if (!Number.isFinite(amount) || amount < 0 || amount > 100000 || Math.round(amount * 100) !== amount * 100) {
          throw new HttpError(400, 'Enter the amount in pounds, for example 50.00.');
        }
        const paidOn = date(a.paid_on);
        const reference = str(a.reference, 200, { optional: true }) || null;
        if (!(await paymentsReady(pool))) throw new HttpError(503, 'Payments cannot be recorded yet: the creator_payments table has not been set up.');
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const cr = (await c.query('select display_name from public.creators where id = $1', [creatorId])).rows[0];
          if (!cr) throw new HttpError(404, 'That creator no longer exists.');
          const ins = await c.query(
            `insert into public.creator_payments (creator_id, month, amount_gbp, paid_on, reference, created_by)
             values ($1, $2, $3, $4, $5, $6) on conflict (creator_id, month) do nothing
             returning id, creator_id, month, amount_gbp::float as amount_gbp, paid_on::text as paid_on, reference`,
            [creatorId, m, amount, paidOn, reference, ctx.staff.userId]);
          if (!ins.rows[0]) throw new HttpError(409, `${cr.display_name} is already marked paid for ${m}.`);
          await audit({ action: 'creator_payment_mark', entity: 'creator_payments', entityId: ins.rows[0].id,
            detail: `Marked ${cr.display_name} paid for ${m}: £${amount.toFixed(2)} on ${paidOn}`, before: null, after: ins.rows[0] });
          return { ok: true, message: `Marked paid: £${amount.toFixed(2)} on ${paidOn}.` };
        });
      },
    },
  };
}
