// Apple Ads watch: HQ is the monthly ceiling that Apple Ads does not have. The apple-ads-sync
// edge function (built by the project chat) syncs every hour into ads_campaigns, ads_spend_daily
// and ads_sync_state,
// raises the alerts in ads_watch_events and does every Apple call, including pausing and
// resuming. HQ never calls Apple: it reads those tables live (the daily snapshot is too old
// for hourly spend), joins RevenueCat's attribution (ads_attribution) for cost per trial and
// per paying customer, and asks the edge function to pause or resume through the
// x-hq-trigger header (app_secrets.hq_trigger, never sent to the browser).
// Reading needs the money permission; pausing, resuming and the settings are owner only.
import type { Pool } from 'pg';
import { HttpError, only, bool, writeTx } from './hq-core.js';
import type { Op } from './hq-act.js';

const SYNC_URL = 'https://kwwnwniyijeuorpbyvmn.supabase.co/functions/v1/apple-ads-sync';
const STALE_HOURS = 3;
const MONTH_START = "date_trunc('month', (now() at time zone 'Europe/London'))::date";
export const ADS_DEFAULTS = { ads_monthly_cap_gbp: 100, ads_alert_pct: 80, ads_auto_pause: true, ads_max_daily_budget_gbp: 10 };
type AdsSettings = typeof ADS_DEFAULTS;
const KEYS = Object.keys(ADS_DEFAULTS) as (keyof AdsSettings)[];
const NOTES: Record<keyof AdsSettings, string> = {
  ads_monthly_cap_gbp: 'Apple Ads: the most HQ lets the account spend in a calendar month, in pounds.',
  ads_alert_pct: 'Apple Ads: warn at this percentage of the monthly cap.',
  ads_auto_pause: 'Apple Ads: pause every campaign before the monthly cap is passed (true or false).',
  ads_max_daily_budget_gbp: 'Apple Ads: a campaign daily budget above this, in pounds, is flagged as a budget jump.',
};
const r2 = (x: unknown) => (x == null ? null : Math.round(Number(x) * 100) / 100);
const per = (spend: number, n: number) => (n > 0 ? r2(spend / n) : null);   // nothing to divide by: null, shown as a dash

async function settings(q: Pool): Promise<AdsSettings> {
  const rows = (await q.query('select key, value from public.app_config where key = any($1)', [KEYS])).rows;
  const s = { ...ADS_DEFAULTS };
  for (const r of rows) {
    const v = String(r.value).trim().replace(/^"|"$/g, '');
    if (r.key === 'ads_auto_pause') s.ads_auto_pause = v === 'true';
    else if (Number.isFinite(Number(v))) (s as any)[r.key] = Number(v);
  }
  return s;
}

// Everything the Ads card, the Today alert and Ralphy show. Connected means apple-ads-sync
// has completed a sync (ads_sync_state.last_ok), not that there is spend: campaigns come from
// ads_campaigns, so a campaign that has not served yet still shows, at £0.
export async function adsWatch(pool: Pool) {
  const ready = (await pool.query(
    `select to_regclass('public.ads_sync_state') is not null and to_regclass('public.ads_campaigns') is not null
        and to_regclass('public.ads_spend_daily') is not null and to_regclass('public.ads_attribution') is not null
        and to_regclass('public.ads_watch_events') is not null as ok`)).rows[0].ok;
  const cfg = await settings(pool);
  if (!ready) return { setup: false, settings: cfg };
  const sync = (await pool.query('select last_attempt, last_ok, last_error from public.ads_sync_state order by id limit 1')).rows[0] || {};
  if (!sync.last_ok) return { setup: false, settings: cfg, last_attempt: sync.last_attempt ?? null, last_error: sync.last_error ?? null };
  const [month, camps, attr, events] = await Promise.all([
    pool.query(`select coalesce(sum(coalesce(spend_gbp, spend)), 0)::float as spend from public.ads_spend_daily where day >= ${MONTH_START}`),
    pool.query(`select c.campaign_id::text as campaign_id, c.name as campaign_name, c.status, c.serving_status, c.daily_budget_gbp::float as daily_budget,
                       c.paused_by_hq, c.paused_at, coalesce(s.spend, 0)::float as spend, coalesce(s.impressions, 0)::int as impressions,
                       coalesce(s.taps, 0)::int as taps, coalesce(s.installs, 0)::int as installs
                  from public.ads_campaigns c
                  left join (select campaign_id, sum(coalesce(spend_gbp, spend)) as spend, sum(impressions) as impressions, sum(taps) as taps, sum(installs) as installs
                               from public.ads_spend_daily where day >= ${MONTH_START} group by campaign_id) s on s.campaign_id = c.campaign_id
                 order by coalesce(s.spend, 0) desc, c.name`),
    pool.query(`select campaign_name,
                       count(*) filter (where trial_started_at >= ${MONTH_START})::int as trials,
                       count(*) filter (where converted_at >= ${MONTH_START})::int as paid,
                       coalesce(sum(revenue_gbp) filter (where converted_at >= ${MONTH_START}), 0)::float as revenue
                  from public.ads_attribution group by campaign_name`),
    pool.query(`select kind, detail, created_at from public.ads_watch_events where created_at > now() - interval '35 days' order by created_at desc limit 40`),
  ]);
  const spend = r2(month.rows[0].spend) || 0;
  const ev = events.rows as { kind: string; detail: any; created_at: Date }[];
  // RevenueCat may send the campaign's name or its id: match either, case and spacing aside.
  const key = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const used = new Set<string>();
  const byCampaign = camps.rows.map((c: any) => {
    const hits = attr.rows.filter((a: any) => a.campaign_name != null && (key(a.campaign_name) === key(c.campaign_name) || key(a.campaign_name) === key(c.campaign_id)));
    hits.forEach((a: any) => used.add(a.campaign_name));
    const trials = hits.reduce((t: number, a: any) => t + a.trials, 0), paid = hits.reduce((t: number, a: any) => t + a.paid, 0);
    return {
      campaign_id: c.campaign_id, campaign_name: c.campaign_name, status: c.status, serving_status: c.serving_status, daily_budget: r2(c.daily_budget),
      paused_by_hq: !!c.paused_by_hq, spend: r2(c.spend) || 0, impressions: c.impressions, taps: c.taps, installs: c.installs, trials, paid,
      revenue_gbp: r2(hits.reduce((t: number, a: any) => t + a.revenue, 0)),
      cost_per_install: per(c.spend, c.installs), cost_per_trial: per(c.spend, trials), cost_per_paid: per(c.spend, paid),
    };
  });
  const unmatched = attr.rows.filter((a: any) => !used.has(a.campaign_name) || a.campaign_name == null)
    .reduce((t: any, a: any) => ({ trials: t.trials + a.trials, paid: t.paid + a.paid }), { trials: 0, paid: 0 });
  const running = camps.rows.filter((c: any) => c.status === 'ENABLED');
  const pausedRows = camps.rows.filter((c: any) => c.paused_by_hq);
  const lastOk = new Date(sync.last_ok), failingNow = !!sync.last_attempt && new Date(sync.last_attempt) > lastOk;
  const syncOk = Date.now() - lastOk.getTime() < STALE_HOURS * 3600e3 && !failingNow;
  const jump = ev.find((e) => e.kind === 'budget_jump' && Date.now() - new Date(e.created_at).getTime() < 24 * 3600e3) || null;
  const pct = cfg.ads_monthly_cap_gbp > 0 ? Math.round((spend / cfg.ads_monthly_cap_gbp) * 1000) / 10 : 100;
  return {
    setup: true, settings: cfg, currency: 'GBP',
    month_spend: spend, cap: cfg.ads_monthly_cap_gbp, pct, remaining: r2(Math.max(0, cfg.ads_monthly_cap_gbp - spend)),
    alert_level: cfg.ads_alert_pct, at_alert: pct >= cfg.ads_alert_pct, at_cap: spend >= cfg.ads_monthly_cap_gbp,
    running_daily_budget: r2(running.reduce((t: number, c: any) => t + (Number(c.daily_budget) || 0), 0)), running_campaigns: running.length,
    paused_by_hq: pausedRows.length > 0, paused_campaigns: pausedRows.length,
    paused_at: pausedRows.length ? pausedRows.map((c: any) => c.paused_at).filter(Boolean).sort().pop() ?? null : null,
    last_sync: sync.last_ok, last_attempt: sync.last_attempt, sync_error: failingNow ? (sync.last_error || 'The last check did not finish.') : null,
    sync_ok: syncOk, stale_hours: STALE_HOURS,
    budget_jump_24h: jump ? { at: jump.created_at, detail: jump.detail } : null,
    by_campaign: byCampaign, unmatched_attribution: unmatched,
    events: ev.slice(0, 10).map((e) => ({ kind: e.kind, at: e.created_at, detail: e.detail })),
  };
}

// The edge function's pause and resume actions, with the server-side trigger secret.
async function callSync(pool: Pool, body: Record<string, unknown>) {
  const sec = (await pool.query("select value from public.app_secrets where name = 'hq_trigger'")).rows[0];
  if (!sec?.value) throw new HttpError(503, 'The HQ trigger secret is not set up.');
  let res: Response;
  try {
    res = await fetch(SYNC_URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hq-trigger': sec.value }, body: JSON.stringify(body) });
  } catch { throw new HttpError(502, 'The apple-ads-sync function did not answer. Nothing was changed by HQ.'); }
  const reply: any = await res.json().catch(() => ({}));
  if (res.status === 404) throw new HttpError(503, 'The apple-ads-sync function is not deployed yet.');
  if (!res.ok || reply?.ok === false) throw new HttpError(502, `apple-ads-sync did not do it${reply?.error ? ': ' + String(reply.error).slice(0, 200) : '.'}`);
  return reply;
}
const campaignsNow = async (pool: Pool) => (await pool.query(
  'select campaign_id::text as campaign_id, name, status, serving_status, daily_budget_gbp, paused_by_hq, paused_at from public.ads_campaigns order by name')).rows;
const ownerOnly = (ctx: any) => { if (ctx.staff.level !== 'owner') throw new HttpError(403, 'Only an owner can do this.'); };

export function adsOps(pool: Pool): Record<string, Op> {
  return {
    ads_watch: {
      perm: 'money',
      run: async (a, ctx) => { only(a, []); return { data: { ...(await adsWatch(pool)), can_act: ctx.staff.level === 'owner' } }; },
    },

    // Pause every campaign. The edge function does it and records the event; HQ audits who asked.
    ads_pause_all: {
      perm: 'money',
      run: async (a, ctx) => {
        only(a, []); ownerOnly(ctx);
        const w = await adsWatch(pool);
        if (!w.setup) throw new HttpError(503, 'Apple Ads is not connected yet.');
        const before = await campaignsNow(pool);
        const reply = await callSync(pool, { action: 'pause_all', source: 'hq', requested_by: ctx.staff.userId });
        return writeTx(pool, ctx.staff.userId, async (_c, audit) => {
          await audit({ action: 'ads_pause_all', entity: 'ads_campaigns', detail: `Paused every Apple Ads campaign from HQ (${w.month_spend.toFixed(2)} of ${w.cap} pounds this month)`,
            before: { campaigns: before, month_spend: w.month_spend, cap: w.cap }, after: { reply } });
          return { ok: true, message: 'Every Apple Ads campaign is being paused. The card updates after the next check.' };
        });
      },
    },

    // Resume only what HQ paused, and only while this month's spend is under the cap.
    ads_resume: {
      perm: 'money',
      run: async (a, ctx) => {
        only(a, []); ownerOnly(ctx);
        const w = await adsWatch(pool);
        if (!w.setup) throw new HttpError(503, 'Apple Ads is not connected yet.');
        if (!w.paused_by_hq) throw new HttpError(409, 'HQ has not paused any campaigns, so there is nothing to resume.');
        if (w.month_spend >= w.cap) throw new HttpError(409, `This month's spend (£${w.month_spend.toFixed(2)}) has reached the £${w.cap} cap. Campaigns stay paused until next month, or until the cap is changed in Admin, Settings.`);
        const before = await campaignsNow(pool);
        const reply = await callSync(pool, { action: 'resume_hq_paused', source: 'hq', requested_by: ctx.staff.userId });
        return writeTx(pool, ctx.staff.userId, async (_c, audit) => {
          await audit({ action: 'ads_resume', entity: 'ads_campaigns', detail: `Resumed the Apple Ads campaigns HQ paused (${w.month_spend.toFixed(2)} of ${w.cap} pounds this month)`,
            before: { campaigns: before, month_spend: w.month_spend, cap: w.cap }, after: { reply } });
          return { ok: true, message: 'The campaigns HQ paused are being resumed. The card updates after the next check.' };
        });
      },
    },

    ads_settings_save: {
      perm: 'money',
      run: async (a, ctx) => {
        only(a, KEYS); ownerOnly(ctx);
        const num = (v: unknown, lo: number, hi: number, what: string, int = false) => {
          const n = Number(v);
          if (v === '' || v == null || !Number.isFinite(n) || n < lo || n > hi || (int && !Number.isInteger(n))) throw new HttpError(400, what);
          return int ? n : Math.round(n * 100) / 100;
        };
        const next: AdsSettings = {
          ads_monthly_cap_gbp: num(a.ads_monthly_cap_gbp, 0, 1000, 'The monthly cap must be between £0 and £1,000.'),
          ads_alert_pct: num(a.ads_alert_pct, 50, 95, 'The alert level must be a whole number between 50 and 95.', true),
          ads_auto_pause: bool(a.ads_auto_pause),
          ads_max_daily_budget_gbp: num(a.ads_max_daily_budget_gbp, 0, 1000, 'The largest daily budget must be between £0 and £1,000.'),
        };
        return writeTx(pool, ctx.staff.userId, async (c, audit) => {
          const before = (await c.query('select key, value from public.app_config where key = any($1) order by key', [KEYS])).rows;
          for (const k of KEYS) {
            await c.query(`insert into public.app_config (key, value, note) values ($1, $2, $3)
                           on conflict (key) do update set value = excluded.value, updated_at = now()`, [k, String(next[k]), NOTES[k]]);
          }
          const after = (await c.query('select key, value from public.app_config where key = any($1) order by key', [KEYS])).rows;
          await audit({ action: 'ads_settings_save', entity: 'app_config', detail: `Apple Ads settings: cap £${next.ads_monthly_cap_gbp}, alert at ${next.ads_alert_pct}%, auto-pause ${next.ads_auto_pause ? 'on' : 'off'}, largest daily budget £${next.ads_max_daily_budget_gbp}`, before, after });
          return { ok: true, message: 'Apple Ads settings saved.' };
        });
      },
    },
  };
}
