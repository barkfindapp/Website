# Brief: website analytics, Plausible Starter, one script

Date: 26 September 2026. Website repo only. Do this AFTER the creator page branch is merged.

ANTI-DRIFT: read and quote current code before changing. Report every file changed. One new
external script and nothing else. Do not touch the app repo, Supabase, RLS, edge functions or
schema. App analytics is separate; this is website only.

## Why
Site loads no analytics. Need to measure (1) creator page reach vs redemptions, (2) launch
traffic sources and outbound App Store clicks.

## Decision: Plausible Starter, cookieless, no banner
No cookies, no consent banner, legal pages stay true. One script tag, nothing in package.json.
Starter plan: custom event PROPERTIES are not included, so NO event carries any data. The
creator slug is in the URL; filter events by page instead. Never pass a props object.

## Quote back before changing
- index.html in full
- src/lib/seo.ts (manages head per route, must not fight the script)
- App.tsx (confirm full page loads, no pushState/client nav)
- Every <a> whose href is APP_STORE_URL across LandingPage.tsx and CreatorPage.tsx
- EarlyAccessForm submit handler
- CreatorPage copy button handler and redeem button
- Privacy policy existing analytics/usage wording

## Task 1: the script exactly as Plausible issued it
In index.html <head>, before any other script:

    <!-- Privacy-friendly analytics by Plausible -->
    <script async src="https://plausible.io/js/pa-_6kv1spXa8WJXPoo4fysz.js"></script>
    <script>
      window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
      plausible.init()
    </script>

Paste byte for byte. Not a module, not an npm package, no React wrapper. Outbound links and
custom events are switched on in Plausible site settings, not code.

## Task 2: helper — src/lib/analytics.ts

    export function track(event: string) {
      try { (window as any).plausible?.(event); } catch {}
    }

No second argument. Swallow every error.

## Task 3: events, only these
- `Creator Page View` — CreatorPage mount, active slug only
- `Creator Code Copied` — Copy button, both clipboard and fallback paths
- `Creator Store Click` — the redeem button
- `Early Access Submit` — EarlyAccessForm, on successful response only

Homepage App Store buttons get NO event (outbound-link tracking already counts them; an extra
event would double count). Put that in a comment beside the helper. Do not track scroll, time,
other clicks, or anything typed. Page views elsewhere come from the script.

## Task 4: privacy policy
Add one short paragraph: the website uses Plausible, a cookieless analytics service hosted in
the EU, recording page visited, referring site, browser type and country, sets no cookies,
does not identify visitors, no email or personal data sent. UK English, no long hyphens, no
exclamation marks. No cookie/consent banner; if you believe consent is required, say so and
leave it out (Josh's decision).

## Do not
No package.json dependency. No props/second arg to plausible(). No GA/GTM/pixel/second
provider. No cookie/consent banner. No event on links outbound tracking covers. Do not change
seo.ts/launch.ts/creators.ts/PageShell.tsx/routing beyond task 3. Do not touch BetaLanding.tsx
or beta.html; the script goes in index.html only.

## Verify/report: files changed; index.html head quoted; analytics.ts quoted; four events file+
line+call; App Store links outbound covers; privacy para before/after; client-nav findings;
blocked-script resilience + no console error; typecheck+build; anything unverifiable from repo.

## Acceptance (deployed preview): /with/test page view + Creator Page View; copy + redeem
events filterable by page; Early Access Submit; homepage App Store button = outbound
apps.apple.com click, no duplicate custom event; script blocked = pages render, buttons work,
no console error; no cookie set; privacy names Plausible.

## For Josh: add the four event names as Goals in Plausible; add www + apex if both resolve;
trial ends 30 days out, move to yearly if keeping.
