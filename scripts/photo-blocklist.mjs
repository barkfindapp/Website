// Place photos that must never appear on the website, by locations.id.
//
// If a venue asks for its photo to come down, add its id here (with a dated
// note) and redeploy the same day. The place's teaser card then falls back to
// its category tile. This covers both venue website photos and Geograph photos.
//
// Example:
//   "00000000-0000-0000-0000-000000000000", // 2 Oct 2026: owner asked by email

export const BLOCKED_PLACE_PHOTOS = new Set([
]);
