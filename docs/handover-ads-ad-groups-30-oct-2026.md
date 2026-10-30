# Handover: Apple Ads ad groups and per-row pause

30 October 2026. From the HQ chat, for the project chat. Josh has approved this spec.

HQ never calls Apple. Everything here is in the database and in `apple-ads-sync` (today v7). When it is live,
tell the HQ chat, which then builds the ops, the Ads card and Ralphy against it. Until then HQ behaves
exactly as now.

## Must not change

- `pause_all` (the kill switch) stays exactly as it is, as its own action. Do not fold it into the new actions.
- `app_config`: the cap, the alert threshold, the auto-pause switch and the max daily budget are untouched.
- The auto-pause guard stays pause-only. It never resumes anything, at campaign or ad group level.
- `ads_attribution` and `ads_attribution_checks` are untouched.

## 1. Database

Apply `supabase/migrations/20261030120000_ads_ad_groups.sql` (on the `hq-ads-ad-groups` branch). It:

- adds `paused_reason` to `ads_campaigns`. This is the only change to that table. The values are `kill_switch`,
  `cap_guard` or `manual`, and null when the row is running;
- creates `ads_ad_groups`, with the same lock-down as `ads_campaigns`: RLS on, no policies, no anon or
  authenticated grants, service_role only.

What the reasons mean:

| Paused by | `paused_by_hq` | `paused_reason` |
|---|---|---|
| HQ Pause all (`pause_all`) | true | `kill_switch` |
| The guard (cap left under a day of budgets, or a daily budget above the max) | true | `cap_guard` |
| HQ, one campaign or ad group (new actions) | true | `manual` |
| Someone in Apple Ads | false | `manual` |
| Running | false | null |

The guard's daily-budget pause counts as `cap_guard` too, because it is the same guard.

## 2. Sync: ad groups

On every sync, after campaigns, for each campaign Apple returns:

1. `GET /campaigns/{campaignId}/adgroups?limit=1000`. Skip `deleted`. Map the fields:
   - `id` to `ad_group_id`;
   - `campaignId`, `name`, `status`, and `servingStatus` to `serving_status`;
   - `servingStateReasons` to `serving_state_reasons` (jsonb, as sent);
   - `automatedKeywordsOptIn` to `search_match`;
   - `defaultBidAmount.amount` and `.currency` to `default_cpt_bid` and `currency`;
   - `default_cpt_bid_gbp` through the same `toGbp` and `fx_usd_gbp` as campaigns.

   Delete `ads_ad_groups` rows for that campaign that Apple no longer returns.
2. `POST /reports/campaigns/{campaignId}/adgroups`, month to date: from the 1st of this month to today,
   London time. Use `timeZone: "ORTZ"` like the campaign report, no granularity and `returnRowTotals: true`.
   From each row's `total`, take:
   - `localSpend` to `spend_month` and `spend_month_gbp`;
   - `impressions`, `taps`;
   - `tapInstalls` to `installs_month`.

   Set `report_synced_at`. If the report call fails, or a figure is missing from Apple's reply, write null
   for that figure. Never estimate it, and never spread campaign spend across ad groups. A report failure
   must not fail the sync: leave the last figures and `report_synced_at` as they were.

With 2 campaigns this is 4 extra Apple calls an hour.

## 3. Sync: who paused what (campaigns and ad groups alike)

Compare Apple's status with the stored row before the upsert:

| Stored row | Apple now | Write | Event |
|---|---|---|---|
| `paused_by_hq` true | PAUSED | keep `paused_by_hq` true, keep `paused_reason` and `paused_at` | none |
| any PAUSED row | ENABLED | `paused_by_hq` false, `paused_reason` null, `paused_at` null | `changed_in_apple_ads`, `{level, id, name, campaign_id, to: "ENABLED", was_reason}` |
| ENABLED, or a new row | PAUSED | `paused_by_hq` false, `paused_reason` `manual`, `paused_at` now | `changed_in_apple_ads`, `{level, id, name, campaign_id, to: "PAUSED"}` |
| `paused_by_hq` false and PAUSED | PAUSED | no change | none |

`level` is `campaign` or `ad_group`. This replaces v7's `stillPausedByHq` line for campaigns.

## 4. Existing actions

- `setStatus` (campaigns) takes the reason. `pause_all` writes `kill_switch`; the guard's two pauses write
  `cap_guard`. Resuming writes `paused_by_hq` false and `paused_reason` null, as now.
- `resume` (alias `resume_hq_paused`, HQ's Resume after a cap pause) brings back only campaigns with
  `paused_by_hq` true **and** `paused_reason` in (`kill_switch`, `cap_guard`). A `manual` pause is only
  undone by its own per-row resume. Keep the cap check as it is, worked out over those campaigns only.
  The reply when there are none is unchanged: "No campaigns paused by HQ."
- `pause_all` and the guard work on campaigns only, as now. They do not touch ad groups.

## 5. Four new actions

HQ sends `{"action", "source": "hq", "requested_by": "<user id>", ...ids}` with `x-hq-trigger`, as now.
Reply 200 every time, with `{"ok": true, ...}` or `{"ok": false, "error": "<one sentence for Josh>"}`.

| Action | Body ids | Apple call |
|---|---|---|
| `pause_campaign` | `campaign_id` | `PUT /campaigns/{id}` `{campaign: {status: "PAUSED"}}` |
| `resume_campaign` | `campaign_id` | `PUT /campaigns/{id}` `{campaign: {status: "ENABLED"}}` |
| `pause_ad_group` | `campaign_id`, `ad_group_id` | `PUT /campaigns/{cid}/adgroups/{agid}` with status `PAUSED` |
| `resume_ad_group` | `campaign_id`, `ad_group_id` | the same with `ENABLED` |

Check the ad group PUT body shape against Apple's v5 reference: I believe it is the bare `{status}`, not
wrapped like campaigns, but have not confirmed it.

Each action:

1. Looks up the stored row and refuses with `ok: false` when:
   - it does not exist;
   - the ad group is not in that campaign;
   - a pause targets a row that is already PAUSED;
   - a resume targets a row that is already ENABLED.
2. **Resume only:** refuses when the cap left this month (cap minus month spend, as in `resume`) is less than
   the daily budgets of the ENABLED campaigns plus this campaign's budget if it is paused. Otherwise the
   guard would pause everything again at the next sync.
   - For an ad group, count its campaign's budget once.
   - A per-row resume works whatever the reason (`manual`, `kill_switch` or `cap_guard`), as long as the
     cap check passes.
3. Makes the Apple call, then updates only that row:
   - **pause:** `status` PAUSED, `paused_by_hq` true, `paused_reason` `manual`, `paused_at` now;
   - **resume:** `status` ENABLED, `paused_by_hq` false, `paused_reason` null, `paused_at` null.
4. Writes an `ads_watch_events` row. The kind is `paused_one` or `resumed_one`, with detail
   `{level, id, name, campaign_id, by, reason: "manual"}`.

   Keep these kinds separate from `paused` and `resumed`, which stay as the kill switch and guard events.
5. Replies `{ok: true, level, id, status, campaign_status}`. `campaign_status` lets HQ say "this ad group
   is enabled but its campaign is paused, so it will not serve".

## 6. Done when

- Pausing one ad group leaves its campaign and the campaign's other ad groups running in Apple Ads.
  `ads_ad_groups` shows it PAUSED, `paused_by_hq` true, reason `manual`.
- Pausing an ad group or campaign in Apple Ads shows on the next sync with `paused_by_hq` false, reason
  `manual`, and a `changed_in_apple_ads` event.
- `pause_all` still pauses every campaign with reason `kill_switch`. `resume` brings those back and leaves
  `manual` ones paused.
- The guard still pauses, with `cap_guard`, and never resumes.
- Tell the HQ chat:
  - the version number;
  - whether the ad group report gave spend, impressions, taps and installs, or which came back null;
  - the confirmed ad group PUT body.
