-- Apple Ads: ad groups, and why a row is paused. For the project chat to apply.
-- 30 Oct 2026. The one allowed change to ads_campaigns is paused_reason.
--
-- paused_reason: 'kill_switch' (HQ's Pause all), 'cap_guard' (apple-ads-sync's auto-pause guard),
-- 'manual' (paused one row at a time, in HQ or in Apple Ads), null when running.
-- paused_by_hq tells HQ and Apple Ads pauses apart: true only for rows HQ or the guard paused.

begin;

alter table public.ads_campaigns
  add column if not exists paused_reason text
    check (paused_reason in ('kill_switch', 'cap_guard', 'manual'));

-- Anything HQ has paused before this change came from Pause all or the guard. Nothing is paused today,
-- so this normally updates no rows.
update public.ads_campaigns
   set paused_reason = 'kill_switch'
 where paused_by_hq and paused_reason is null;

create table if not exists public.ads_ad_groups (
  ad_group_id            bigint primary key,
  campaign_id            bigint not null references public.ads_campaigns (campaign_id) on delete cascade,
  name                   text not null,
  status                 text,          -- Apple status: ENABLED or PAUSED
  serving_status         text,          -- Apple servingStatus: RUNNING or NOT_RUNNING
  serving_state_reasons  jsonb,         -- Apple servingStateReasons, as sent
  search_match           boolean,       -- Apple automatedKeywordsOptIn
  default_cpt_bid        numeric,       -- Apple defaultBidAmount.amount, in its own currency
  currency               text,
  default_cpt_bid_gbp    numeric,
  paused_by_hq           boolean not null default false,
  paused_reason          text check (paused_reason in ('kill_switch', 'cap_guard', 'manual')),
  paused_at              timestamptz,
  -- Month to date (Europe/London), from Apple's ad group report. Null means Apple did not give it:
  -- HQ shows a dash, never an estimate.
  spend_month            numeric,
  spend_month_gbp        numeric,
  impressions_month      integer,
  taps_month             integer,
  installs_month         integer,
  report_synced_at       timestamptz,
  synced_at              timestamptz,
  updated_at             timestamptz not null default now()
);
create index if not exists ads_ad_groups_campaign_idx on public.ads_ad_groups (campaign_id);

-- Same lock-down as ads_campaigns: RLS on, no policies, no client grants. Only the service role
-- (apple-ads-sync) and the HQ server's database user read or write it.
alter table public.ads_ad_groups enable row level security;
revoke all on public.ads_ad_groups from anon, authenticated;
grant all on public.ads_ad_groups to service_role;

commit;
