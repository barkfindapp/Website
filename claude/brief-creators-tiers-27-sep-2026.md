# Brief: tiered pay on /creators, with a follower-count calculator

Date: 27 September 2026. Fresh branch off main. Do not merge without an explicit "merge".

ANTI-DRIFT: read and quote before changing. Report every file changed. No dependency, no
schema, no Supabase, no app repo. Only src/pages/CreatorsPage.tsx changes.

## Why
Single rate (£4, £50 floor, cap 50) is fair under 10,000 followers, an insult above 30,000.
Three tiers: two published, one bespoke. Calculator gains a follower-count input.

## Task 1: the constant
Replace PAY with NOTICE_DAYS, Tier type, TIERS[] (small: 0-10000 £4/£50/50; mid: 10000-30000
£6/£100/100), BESPOKE_FROM = 30000, tierFor(followers). Every fee/floor/cap/notice figure on
the page comes from these. grep for hardcoded £4/£6/£50/£100/50/100/7 days after.

## Task 2: copy "How you are paid" (verbatim, figures from TIERS)
Intro: what we pay depends on audience size at code issue; larger of TikTok/Instagram; tier
fixed while code live. Two tier lines (two stacked cards, Business.tsx convention). Bespoke
line as prose under, not a third row (Over 30,000: agree directly, email info@barkfind.com).
Then: confirmed-subscriber definition; Premium free for as long as the app exists + clear cap
moves up a tier; payment monthly in arrears / Apple 14 day trial timing. Keep the calculator.

## Task 3: the calculator
Same card, label YOUR EARNINGS. Input 1: followers slider 0-50000 step 500 default 5000 +
editable number field (thousands separator on display); below: "Tier: {label}" or bespoke
line. Input 2: subs slider max tier.cap step 1 default min(10, cap); clamp on tier change;
bespoke hides subs slider+figure, shows "Get in touch" mailto (subject "Creator programme")
in the figure's place. Output: £max(n*fee, floor) (was n*fee); note lines by threshold + cap
line "Clear it and you move up a tier". Both sliders accent-rust; number field reuses email
input border/radius.

## Task 4: the terms -> Version 2, 27 September 2026
Item 1: tier-based rate wording (£{TIERS[0].fee} under 10,000, £{TIERS[1].fee} 10,000-30,000,
agreed in writing above). Item 3: cap {TIERS[0].cap} or {TIERS[1].cap}, clear cap issues next
code a tier up. New item after 3: tier set by larger of TikTok/Instagram on issue day, may ask
for screenshot. Items 4 and 7 (now 5 and 8) keep NOTICE_DAYS. Renumber via <ol>.

## Task 5: small-print line under offer card
If a line outside How-you-are-paid/terms says £4/£50/50 redemptions, read it from TIERS[0];
else say none.

## Do not
No change to the follower offer (20% off, £31.99, 14 day trial). No touching CreatorPage.tsx,
creators.ts, nav, footer, sitemap. No form/submit/network (mailto only). No bespoke figure
anywhere. No dependency. No merge. UK English, sentence case.

## For Josh
- "Premium free for as long as the app exists" is a new commitment now stated for every tier.
- Mid tier £600 ceiling is intentional pre-launch; expect to raise it.
- Jenny's tier: check her larger follower count on JENNY20 issue day; note in the patch.
- Terms went V1 -> V2 before V1 was agreed; resend Jenny the link.
