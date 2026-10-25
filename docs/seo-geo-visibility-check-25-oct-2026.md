# SEO and GEO visibility check, 25 October 2026

Check and report only. No site changes were made. Verified against the live site
(https://www.barkfind.com, fetched with JavaScript disabled using a Googlebot
user agent) and the repo build scripts, not against the HQ doc.

## Headline

The problem that prompted this check is no longer reproducible. Fetching
`/terms` and `/privacy` without JavaScript now returns each page's own title,
meta description, canonical and body, not the homepage shell. Every town guide
and every news post does the same. The SEO/GEO build (HQ revs 52 to 55) is
deployed and working.

The site exposes 34 indexable URLs, each with unique metadata, all in the
sitemap. There is no "thousands of pages all claiming to be the homepage"
problem, because there are not thousands of pages and the ones that exist are
prerendered correctly. The real constraint on ranking is now content breadth:
9 town guides (clustered in Somerset and Bristol) and 14 news posts. The
technical foundation is sound; the lever is how much rankable content exists and
whether it gets indexed.

## Checks

### 1. Prerender coverage: VERIFIED

The prerender list (`scripts/prerender.mjs`) is the static marketing routes
`/`, `/treats`, `/business`, `/support`, `/privacy`, `/terms`,
`/delete-account`, `/confirmed`, `/creators`, `/reset-password`, `/404`, plus
all resource routes generated at build time from `resources.json`
(`/discover`, `/dog-friendly`, each town guide, `/news`, each post, `/events`).
Excluded on purpose: `/mockup`, `/beta`, `/beta-treats`, `/admin`,
`/unsubscribed`.

Three samples fetched with JavaScript disabled:

| URL | Title | Canonical | Body present |
|---|---|---|---|
| `/terms` | `Terms of Use \| BarkFind` | `.../terms` | yes |
| `/privacy` | `Privacy Policy \| BarkFind` | `.../privacy` | yes |
| `/dog-friendly/weston-super-mare` | `Dog-friendly Weston-super-Mare: beaches and woodland \| BarkFind` | self | yes (h1 + 8 section h2s: Woods and parks, Beach, Cafes and places to eat, Pubs and bars, Before you go, Questions about dog rules, Nearby town guides) |

The guide's raw HTML carries the real article body, not an empty `#root`. The
stale evidence in the brief (homepage shell on `/terms` and `/privacy`) predates
the deployed fix.

### 2. Per-page metadata: VERIFIED

Pages carry their own title, meta description, canonical and og: tags. Real
example, `/dog-friendly/weston-super-mare`, verbatim:

- title: `Dog-friendly Weston-super-Mare: beaches and woodland | BarkFind`
- description: `If you need space for off-lead running or secure fenced parks for dogs with poor recall, the town has both.`
- canonical: `https://www.barkfind.com/dog-friendly/weston-super-mare`
- og:url: `https://www.barkfind.com/dog-friendly/weston-super-mare`

No homepage inheritance observed on any sampled route.

### 3. Structured data: VERIFIED, with one gap

JSON-LD present and page-appropriate:

- Town guide: `Article`, `BreadcrumbList`, `FAQPage`, `ImageObject`,
  `Organization`, `ListItem`.
- News post: `Article`, `ImageObject`, `Organization`.
- Homepage: `Organization`, `MobileApplication`, `FAQPage`, `Offer`.

Gap: there is no `LocalBusiness` or `Place` schema with name, address, geo and
`aggregateRating`. That is because there are no per-venue web pages. Venues are
listed inside the `Article` guides, not as standalone indexable pages or
structured entities. `Article` is the right type for an editorial guide, so this
is not broken; it is a deliberate consequence of venues living in the app, not
on the site. Flagged because the brief asked specifically for venue-level
`LocalBusiness`/`Place`/geo/`aggregateRating`, and none exists.

### 4. Sitemap and robots: VERIFIED

- `sitemap.xml` exists, HTTP 200, 34 `<loc>` entries, with `<lastmod>` and
  `<priority>` per URL.
- Location content is in it: all 9 town guides, the `/dog-friendly` hub, all 14
  news posts and the `/news` index.
- Referenced in `robots.txt`: `Sitemap: https://www.barkfind.com/sitemap.xml`.
- `robots.txt` is `User-agent: * / Allow: /` with no `Disallow`, so nothing that
  should be indexed is blocked.
- `/hq` is excluded from the sitemap and returns `X-Robots-Tag: noindex, nofollow`
  (title `BarkFind HQ`). Correctly kept out of the index by header rather than by
  Disallow, which is the right way (a disallowed page can never be read to see its
  noindex).

### 5. AI crawler access (GEO): VERIFIED, decision pending

- `robots.txt` has no rules specific to `GPTBot`, `ClaudeBot`, `PerplexityBot` or
  `Google-Extended`. Under the single `User-agent: * / Allow: /`, all four are
  currently allowed to crawl.
- `llms.txt` exists at the root and is well-formed: intro, then sections
  Discover, Town guides (9, incl. Winscombe), News (14) and About.

State reported as-is. Whether to keep allowing the AI crawlers is Josh's call; no
change made.

### 6. Internal linking: VERIFIED

Resource pages are reachable from the homepage through real `<a href>` anchors in
prerendered HTML, not only client-side routing:

- Homepage to `/discover`: 3 anchors.
- `/discover` to town guides: 10 anchors. `/dog-friendly` hub to guides: 9
  anchors (all guides). `/news` to posts: 14 anchors.

Crawl path home to Discover to guides/news to each item is intact. Minor note:
the homepage links to `/discover` but not directly to `/dog-friendly` or `/news`,
so guides sit two clicks from the homepage. Not a blocker; a direct footer link
would shorten the path.

### 7. Indexation: NOT VERIFIED (no access this session)

No Google Search Console or Bing Webmaster Tools credentials are reachable from
this session (no connected GSC/Bing integration, no API keys), so indexed page
count cannot be reported. Needs a manual check in GSC and Bing Webmaster Tools:
confirm the 34 sitemap URLs are indexed, and watch for any still flagged
"Crawled, not indexed" or "Duplicate" from before the prerender fix deployed.

## Ranked actions

Nothing is broken in a way that stops location pages ranking. Ranked by impact
on organic reach:

1. Content breadth (highest). 9 town guides, all in one region. If organic is the
   channel, this is the ceiling. More towns and cities is the main lever, not a
   technical fix.
2. Confirm indexation in GSC and Bing (high, quick). The prerender fix may be
   recent; verify Google and Bing have actually indexed the 34 URLs and cleared
   any old duplicate/soft-404 flags.
3. Venue-level structured data (medium). If venue rich results or assistant
   answers about specific places are wanted, add `Place`/`LocalBusiness` entities
   (name, address, geo, rating) inside the guides, for example as an `ItemList`.
   Optional and strategic, not a defect.
4. Homepage to guides/news link (low). Add a footer link to `/dog-friendly` and
   `/news` to bring guides one click from the homepage.
5. AI crawler policy (decision, not a fix). Crawlers are allowed by default and
   `llms.txt` is in place. Decide whether that is intended.

## Method

Live pages fetched with `curl` and a Googlebot user agent, JavaScript disabled,
so this is what a crawler sees. Repo behaviour read from `scripts/prerender.mjs`
and `scripts/resources-sitemap.mjs`. Live HEAD check for the `/hq`
`X-Robots-Tag`. No credentials-based indexation data available this session.
