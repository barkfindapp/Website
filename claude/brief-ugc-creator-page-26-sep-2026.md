Brief: creator landing page, `barkfind.com/with/{slug}`
Date: 26 September 2026. For Claude Code in the website repo (Vite SPA, not the Lovable app repo).

ANTI-DRIFT: read and quote the current code before changing it. Report every file changed. Do not add a dependency without saying which and why. Do not touch the app repo, Supabase, RLS, any edge function or any schema. This is a website change and nothing else.

Why this page exists
BarkFind is paying creators per confirmed subscriber, starting with one family creator who has a dog account. Apple and Google collect the money, so there is no way to see a creator's revenue directly. The tracker is therefore the offer code: each creator gets a unique Apple offer code, and anyone who redeems it is theirs by definition. Redemptions are counted in App Store Connect, and that count is what the creator is paid on.
The page has one job: get a visitor from a creator's post to the App Store with that creator's code applied, without the visitor having to remember or type anything. Most drop-off in a code flow is people forgetting the code between the caption and the checkout. The page removes that step.
It is deliberately not on the main site. The code must never appear on the homepage, pricing page or anywhere a visitor who did not come from the creator could find it, or the redemption count stops meaning anything.

What is fixed and must not be reinvented
* App Store ID is `6782144377`. Confirmed against App Store Connect on 19 September.
* Apple offer code redemption URL format, which applies the code automatically when tapped:
  `https://apps.apple.com/redeem?ctx=offercodes&id=6782144377&code={CODE}`
* The offer is the founding-member first year: £19.99 instead of £39.99, first year only, then £39.99 on renewal. Every published mention already says "first year" (`LandingPage.tsx:1008`, `:1095`, `:1250`). That wording is load-bearing. Do not shorten it to "founding-member price" and do not write "locked in", "forever" or "as long as you stay".
* Plans and trial: £5.99 monthly, £39.99 annual, 14 day free trial. Do not restate the treats programme on this page.
* iPhone only at launch. Android is not built. Reuse the existing Android email capture, do not build a second one.
* The site is pre-launch until release day. Every "launching soon" and "join early access" line is correct today and wrong on release, staged in `docs/launch-day-copy-changes.md`. This page must follow the same switch, not a separate one.

Task 1: a data-driven route, not a one-off page
One component, `CreatorPage`, at `/with/:slug`. Content comes from `src/data/creators.ts`:
Creator = { slug, displayName, handle?, offerCode, active }. CREATORS empty in this pass.
An unknown or inactive slug renders the site's existing not-found behaviour, not a blank page and not a redirect to the homepage. No photo/bio/testimonial field.

Task 2: the page itself
Mobile first, one screen. Reuse the site's header, footer and tokens.
Eyebrow: `{displayName} sent you`
Heading: Somewhere your dog is actually welcome, not just tolerated
Body: BarkFind checks the dog policy, the council restrictions and what other owners found when they turned up, so you know before you set off. {displayName}'s link gets you the founding-member price: your first year for £19.99 instead of £39.99, after a 14 day free trial.
Code block, monospaced, Copy button: `{offerCode}`, and beneath, small: Applied automatically if you tap the button below. If it is not, paste it in on the App Store.
Primary button: Get the app with {displayName}'s code -> `https://apps.apple.com/redeem?ctx=offercodes&id=6782144377&code={offerCode}`.
Underneath, small: iPhone only for now. First year at £19.99, then £39.99 a year unless you cancel. Cancel any time during the free trial and you pay nothing.
Copy button: navigator.clipboard.writeText(offerCode) with a two second "Copied" state, try/catch, fall back to selecting the text.
Android and desktop: detect the platform the same way the existing Android email capture does; do not write a second user-agent check. On Android, replace the primary button with the existing email capture, introduced by: BarkFind is on iPhone first. Leave your email and you will hear the day it reaches Android. Keep the code visible. On desktop, show the button as normal.
Pre-launch: follow whatever switch docs uses. Before launch, primary action is the email capture for all platforms, with: {displayName}'s code will be waiting for you on launch day. After launch, the redeem button. Add this page's two lines to docs/launch-day-copy-changes.md.
Head: if the site has per-route head management, set title to `{displayName} sent you | BarkFind` and add meta robots noindex. No new library if there is none.

Task 3: measurement
Primary metric is offer code redemptions in App Store Connect. Secondary is page visits: if the site already loads analytics, fire one page-view event with the slug as a property; if not, do not add analytics, report it as a gap. No RevenueCat/Apple campaign attribution. Comment at the top of CreatorPage that the code is the tracker.

Do not
* No offer code or /with/ link on homepage, pricing, nav, footer or sitemap.
* No permanence claim (locked in, forever, for life, as long as you stay). First year only.
* No treats/points/rewards. No scarcity line. No photo/bio/testimonial.
* No second platform-detection function or second email capture. No dependency without saying which and why.
* No change to any existing page, other than appending two lines to docs/launch-day-copy-changes.md.
* No exclamation marks, rhetorical questions, dog puns or long hyphens. UK English, sentence case.

Acceptance criteria: see brief. Test entry slug "test" / offerCode "TESTCODE"; remove before committing.

Open questions for Josh (not for Claude Code): founding-member cap sharing; per-code redemption limit; code naming; ad disclosure in the creator terms.
