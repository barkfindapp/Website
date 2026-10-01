# Launch-day copy changes

Status: **not to be executed yet.** The app is approved but held unreleased (featuring
nomination, ~3 weeks lead). Every line below is **correct today** and becomes wrong the
moment the App Store release button is pressed. Execute this list on release day, not before.

This file is intentionally uncommitted / on its own branch so it is ready to run on the day
rather than rediscovered. Do not fold it into the guest-browsing legal work.

Related: the two legal pages (`/privacy`, `/terms`) still carry a `pending go-live date`
placeholder. On release day, set both "Last updated" values to the real release date at the
same time as the changes below.

Out of scope here (unresolved, do not touch as part of launch-day either): what is free vs
paid. Leave pricing claims as they stand until that is decided.

---

## What changes on the day
Two themes:
1. "Launching soon / coming soon / join early access / register interest" -> the app is
   live and downloadable. CTAs should point to the App Store, not the early-access email form.
2. "At launch you'll create an account first" -> no account is needed to browse (guest
   browsing shipped). An account is only for reviews, favourites, dog profiles, Mylo and subscribing.

First real task on the day: flip the launch switch in `src/data/launch.ts`.
- `src/data/launch.ts` — the single source of truth for pre/post-launch. Flip both:
    `export const LAUNCHED = false;`      -> `true`
    `export const APP_STORE_URL = "#download";` -> real `https://apps.apple.com/...` URL
  `LAUNCHED` flips every page that reads it. Today that is the creator pages at
  `/with/:slug`, which switch from the email capture to the Apple redeem button.
  `APP_STORE_URL` is imported by `LandingPage.tsx`. Note: the hero/CTA buttons currently
  hardcode `href="#download"`, so flipping `APP_STORE_URL` is not enough on its own; the
  button hrefs must also be changed to `APP_STORE_URL` (see the line-by-line entries below).

Post-flip checks:
- Confirm the homepage App Store buttons now point to the store (not `#download`) and show
  as outbound-link clicks for `apps.apple.com` in Plausible. Until launch day they are
  `#download` anchors, so no homepage outbound click is recorded.
- Confirm a creator page redeem button still fires `Creator Store Click` and also shows as
  an `apps.apple.com` outbound click.

## Line-by-line (verified 15 Sep 2026)

### src/pages/LandingPage.tsx
- `APP_STORE_URL` now lives in `src/data/launch.ts` (see the switch above), imported here.
- `:92` hero pill "Coming soon to iOS" -> "Now on iOS" / "Download on iOS".
- `:101` "…Launching soon on iPhone. Join early access below." -> "…Download it free on the App Store." (mind the guest-browsing angle: free to browse).
- `:124` badge "Launching soon on iPhone" -> "On the App Store" (or drop).
- `:26,:56,:106,:968` CTA buttons "Get Early Access" / "Get early access" (href `#download`) -> "Download on the App Store" pointing at `APP_STORE_URL`.
- `:774` How-it-works step 1 title "Join early access" -> a real first step, e.g. "Download BarkFind" (and the step body).
- `:1069` FAQ "How do I get started?" answer ("BarkFind is launching on iPhone soon. Join early access…") -> "Download BarkFind free from the App Store. You can browse straight away; make an account when you want to review or save a place."
- `:1072` FAQ Android answer ("Android is on the roadmap and coming soon…") -> keep if Android still pending; only the iOS framing changes.
- `DownloadCTA` (~`:1204+`) — the early-access email capture section. Decide: keep as a mailing-list signup, or swap the primary action to an App Store button. The `EarlyAccessForm` (~`:1126+`) and its "Get early access" button copy change with it.

### src/pages/Support.tsx
- `:37` "BarkFind is launching on iPhone soon and isn't downloadable yet. Join early access… At launch you'll create an account, add your dog's profile, and start your 14-day free trial." -> "BarkFind is on the App Store. You can browse without an account; create one when you want to review, save a place, add a dog profile or subscribe. New subscribers get a 14-day free trial."
- `:40` "Register interest on our homepage to be notified when either launches." -> update the iOS half (iOS is live); keep Android wording if still pending.

### src/pages/BetaLanding.tsx
- `:823` same "launches on iPhone soon / early access" description as LandingPage. `/beta` is the redesign preview; update in step with LandingPage if it is still being served.

### Discover section (/discover, /dog-friendly, /news, /events)
Added 1 Oct 2026. The section's one download call to action reads `LAUNCHED` and
`APP_STORE_URL` from `src/data/launch.ts`, so flipping the switch changes it on every
Discover page at once. Check each line after the flip; edit only if it did not switch.
- `src/pages/resources/parts.tsx` `DownloadCta`, the "The full picture is in the app" box at
  the foot of `/discover`, `/dog-friendly`, every town guide, `/news`, every news post and `/events`:
  - "BarkFind is coming to iPhone soon." -> "Free to download on iPhone." (automatic)
  - button "Get early access" (href `/#download`) -> "Download BarkFind" pointing at
    `APP_STORE_URL` (automatic)
  - Unchanged on the day: the line before it ("Opening times and dog policies for every place,
    plus Mylo, are in the app." / on guide pages "Opening times and dog policies for all N, plus
    Mylo, are in the app.").
- Press box on `/discover` and `/news` (`PressBox` in the same file): no launch wording. If the
  launch press release was approved before release day with "coming soon" wording, edit it in
  the content queue and redeploy so the "Latest press release" link points at current copy.
- Shared, not Discover-only: the inner-page header button "Start Free Trial" (`href="/#download"`,
  `src/components/PageShell.tsx`) also shows on Discover pages. It is not in the list above
  either; decide on the day whether it should point at `APP_STORE_URL`.

## Not launch-day, but adjacent (guest browsing, tracked separately)
- Exposing **Delete Account** to a guest (never-signed-in) session is a small client change.
  A new binary is coming anyway, so it can ride along. When the app confirms an in-app
  route for guests, upgrade the `/privacy` "Your rights" wording (currently: guests use app
  deletion + the 30-day inactivity purge + email) to name the in-app button.
