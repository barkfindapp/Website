# Brief: "How Treats work" page

> **Revised 12 Aug 2026.** The rewards backend is now built. Mechanics below were
> verified against the production database and App Store Connect on that date.
> This supersedes the 11 Aug revision, which described a single reward set and no
> annual tier. Trust this file over any older description.

## Where it lives

- Route: `/treats`, component `src/pages/Treats.tsx`.
- Deep-linked from inside the iOS app as well as visited directly, so it must
  work standalone. Do not change the route.
- Design system, header, footer, mobile-first layout, UK English and the warm
  plain-English tone are unchanged.
- Brand voice: **no em dashes** in consumer copy (use commas, colons, brackets,
  full stops). Treats are retention, never acquisition. See the barkfind-brand-voice skill.
- A beta variant exists at `/beta-treats` (`src/pages/BetaTreats.tsx`) with an
  interactive `TierTrack`. It has NOT yet been updated to the two-plan model and
  currently contradicts this page. Update it before promotion.

## Earning (unchanged, verified correct)

- An approved review earns 1 point.
- 2 points when the description is 40 characters or more. This is the only
  condition for the second point.
- Photos are welcome but do not affect points.
- Reviews are moderated. Only approved reviews earn points.

## Rewards differ by plan (verified 12 Aug 2026)

A percentage discount can't sensibly apply to a single annual bill, so the two
plans get different treats. Same points, same rolling 90-day window.

| Points | Window          | Monthly                                   | Annual                          |
| ------ | --------------- | ----------------------------------------- | ------------------------------- |
| 10     | rolling 90 days | 25% off next month (£4.49 vs £5.99)       | 30 days added to subscription   |
| 20     | rolling 90 days | 50% off next month (£2.99 vs £5.99)       | 90 days added to subscription   |
| 50     | lifetime        | A year free. Once per account, ever.      | A year free. Once per account.  |

- Prices are exact, confirmed in App Store Connect. £4.49 is 25.0% off, £2.99 is
  50.1% off, so both percentage claims are honest.
- Present the two plans **side by side**, not annual in a footnote.

## Redemption (what genuinely happens)

- Claim in the app: Profile, then Treats.
- Monthly discounts: Apple applies the discount to the next payment. No code, no voucher.
- Annual extensions: applied immediately. Renewal date moves out, visible in the app.
- A year free: Apple moves the next payment twelve months later. Subscription
  continues as normal, nothing is cancelled.

Two limits, stated plainly on the page:
- One claim per billing cycle. No stacking claims onto one bill.
- Apple allows a maximum of three subscription extensions per person per year, so
  annual members can claim at most three times in twelve months.

A failed or cancelled claim **releases the points** rather than consuming them,
so the member can claim again. Support: info@barkfind.com.

## Timing

Treats are built but not yet shipped in the app, and the app is not publicly
downloadable. The page keeps the "launches soon / when Treats go live" framing.
Do NOT write present-tense copy implying anyone can claim today.

## Do not

- No em dashes.
- Don't describe progress in reviews, or milestones counted in reviews.
- Don't mention the legacy `profiles.milestone_*` columns.
- Don't say photos are required.
- Don't frame redemption around a promo code the user types in.
- Don't invent anything not stated here. Flag gaps, don't fill them.

## Open placeholders / to confirm

- `/beta-treats` still on the old single-reward model. Needs the two-plan update.
- Nothing else outstanding as of this revision.
