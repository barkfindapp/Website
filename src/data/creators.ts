// Creator config for the /with/:slug pages. Adding a creator is a data entry
// here, not a new page. An unknown or inactive slug renders the not-found card
// in CreatorPage. Set active: false to switch a lapsed deal off with one flag.
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
