// Fallback only. The database (public.creators, read through creators_public)
// is now the source of truth for the /with/:slug pages, and new creators are
// added in HQ, not here. CreatorPage uses this list only when the database
// request fails, so a live page never goes blank. Keep it roughly in step with
// the active creators, but a creator missing here just shows not-found during
// an outage.
export type Creator = {
  slug: string; // URL segment, lowercase, no spaces
  displayName: string; // as they want to be credited
  handle?: string; // e.g. "@name", optional
  offerCode: string; // Apple offer code, uppercase
  active: boolean; // false = not-found card
};

export const CREATORS: Creator[] = [
  {
    slug: "jenny",
    displayName: "Jenny",
    handle: "@jennoid",
    offerCode: "JENNY20",
    active: true,
  },
  {
    slug: "chlo",
    displayName: "Chlo",
    handle: "@_chloandarlo_",
    offerCode: "CHLO20",
    active: true,
  },
  {
    slug: "becs",
    displayName: "Becs",
    handle: "@spaniels.life",
    offerCode: "BECS20",
    active: true,
  },
];
