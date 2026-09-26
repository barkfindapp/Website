# Brief: /creators page, public-facing copy, shared privately for now

Date: 26 September 2026. Website repo, fresh branch off main AFTER creator-page merged.

ANTI-DRIFT: read and quote before changing. Report every file changed. No dependency, no
schema, no Supabase, no app repo. One static page.

## What it is
A page explaining the BarkFind creator programme, written as if any creator could read it,
but not linked anywhere and not indexed. Sent by link to one creator for now. When the
programme opens up, the only change is adding a nav link and removing noindex. Static page:
no data file, no form, no code, no slug.

## Route and chrome
- Route /creators, added to ROUTES in App.tsx as an exact match
- PageShell, standard hero (not compact). Title "Creators", eyebrow "Working with BarkFind"
- useSeo({ title: "Creators | BarkFind", noindex: true }), not in sitemap
- No link from nav, footer, homepage or any other page
- Reuse tokens/headings/spacing from Support.tsx or Business.tsx (quote which and why)

## Placeholders Josh must fill (render in a visible highlight; do NOT commit while any remain)
[FEE], [FLOOR], [CAP]

## Copy, in order, verbatim

### The problem we are fixing
Most "dog friendly" is a guess. A pub that lets dogs in the garden but not the bar. A beach
with a summer ban nobody mentioned. A cafe that was fine last year and is not now. BarkFind
checks the venue's own dog policy, the council restrictions and what other owners found when
they turned up, so people know before they set off.
We launch on iPhone on 13 October 2026, UK only. Android is planned but not built.

### What we are asking for
An honest post. You have followers who own dogs and trust what you say about where you take
yours. We would like you to try BarkFind with your own dog, in your own area, and tell them
what you found. If it fell short somewhere, say so. A post that reads like an advert does
worse for both of us than one that reads like you.
We do not script posts, approve scripts or ask for edits, with one exception in the section
on what not to say.

### What your followers get
20% off their first year of BarkFind Premium: £31.99 instead of £39.99, after a 14 day free
trial. The trial is free and can be cancelled before it ends with nothing to pay.
Premium is the full app: dog-matched search, Ask Mylo, saving spots and recommendations
matched to their dog. Browsing the map, opening any place and reading its dog policy and
restrictions is free for everyone, with or without a subscription.

### How it works
You get a page on our site at barkfind.com/with/yourname and a code. The page shows your code
and a button that opens the App Store with the code already applied, so nobody has to remember
or type anything. Put the link in your bio and your stories, and say the code out loud in
video for anyone watching without sound.
Your code is unique to you. That is how we know a subscriber came from you.

### How you are paid
You are paid per person who uses your code and becomes a paying subscriber after their free
trial, at [FEE] each. Downloads, trial starts and people who cancel during the trial are not
counted, because we have not been paid for them either.
Your first post carries a guaranteed [FLOOR] regardless of results, so you are not working for
nothing if it does not land.
Payment is monthly in arrears, by bank transfer, against the previous month's confirmed
subscribers. Apple's 14 day trial means a post on the 1st produces its first confirmed
subscribers around the 15th, and the month settles about four weeks after the post. Your code
carries a redemption limit of [CAP], which we can raise together once we have seen it work.

### How it is counted
Apple counts every redemption of your code and reports it to us. We will send you that figure
with each payment. There is no tracking of your followers, no cookies on our site and nothing
collected about who they are. The code is the whole mechanism.

### What you must do
Every post, story and video that mentions BarkFind must be labelled as an ad. In the UK that
is the law, not our preference. "Ad" or "Paid partnership" at the start, visible without
tapping "more". Performance-based pay is still pay.

### What not to say
- The discount is on the first year. Do not say "forever", "locked in" or "for life". It
  renews at £39.99 unless cancelled.
- Do not mention points, treats or rewards. They exist, they are for existing users, and they
  are not part of your offer.
- Do not promise BarkFind covers everywhere. It covers a lot of the UK and some places are
  thin. "Check your area" is honest; "every pub in Britain" is not.

### What we give you
Founding creator credit on our site when the programme goes public. Early access to new
features before they ship, and a direct line to the person building it. A say in what gets
built next, because you hear from dog owners we do not.
Assets on request: the app icon, screenshots, a short description in our words and the correct
spelling of Mylo.

### Get in touch
info@barkfind.com. One person reads it and it is the same person who built the app.

## Do not
No link from anywhere. No form/sign-up/application. No photo/testimonial/logo wall. Do not
reword the copy (if a line conflicts with the repo, say what and stop). Do not commit while
[FEE]/[FLOOR]/[CAP] remain. No exclamation marks, rhetorical questions, dog puns or long
hyphens. UK English.

## For Josh
Decide the three numbers: fee £3 to £6.50 per confirmed subscriber, £50 floor on the first
post, cap = month-one willingness. Then tell Claude Code and it commits.
