// Town-to-county labels for the /dog-friendly/ guide index.
//
// The database has no county data, so this static map is the only source of
// county labels on the website. The build (scripts/build-resources.mjs) finds
// each published town's most common postcode district from the venue data,
// then looks it up here: a district entry wins, otherwise the area entry.
//
// Postcode areas do not follow county lines, so where an area straddles two
// counties we add a district entry for each town actually in use and no
// area-wide entry. That way a future town in an unmapped district of that area
// lands under "More towns" with a build warning, rather than under a wrong
// county. Areas that sit inside one county (BS, TA) keep a single area entry.
//
// When the lookup needs to move to the planned content_town_areas database
// view, this is the one function to change: keep the source behind
// countyForDistrict so the swap stays a one-file change.
//
// A town whose postcode matches nothing here is listed under "More towns" and
// the build prints a warning naming it, so a gap is visible rather than guessed.

// Postcode area (letters only) -> county label.
// Only for areas that sit wholly inside one county. BS and TA cover the nine
// guides that were live before UK-wide guides began, and must not change.
export const AREA_COUNTIES = {
  BS: "Bristol and North Somerset",
  TA: "Somerset",
};

// Postcode district -> county label. Overrides the area label for that district.
// Used for areas that cross a county line (EX, PL, BA, BL, YO), so only the
// districts actually in use are mapped. Each entry notes the guide town it
// serves; districts were taken from each town's dominant venue district in the
// production data on 28 October 2026, counties from Office for National
// Statistics ceremonial county data (via postcodes.io).
export const DISTRICT_COUNTIES = {
  // Devon
  EX20: "Devon", // Okehampton
  EX12: "Devon", // Seaton
  EX10: "Devon", // Sidmouth
  EX33: "Devon", // Braunton
  EX34: "Devon", // Woolacombe
  // Cornwall (EX and PL both reach into Cornwall)
  EX23: "Cornwall", // Bude
  PL31: "Cornwall", // Bodmin
  // Somerset (BA also covers Wiltshire; Bath's venues split evenly across BA1
  // and BA2, so both are mapped to avoid a tie falling through to "More towns")
  BA1: "Somerset", // Bath
  BA2: "Somerset", // Bath
  // Greater Manchester (BL0 also reaches into Lancashire, so it stays unmapped)
  BL9: "Greater Manchester", // Bury
  // North Yorkshire (YO also covers East Yorkshire)
  YO11: "North Yorkshire", // Scarborough
};

export const UNMAPPED_COUNTY = "More towns";

export function countyForDistrict(district) {
  if (!district) return null;
  const d = String(district).toUpperCase();
  if (DISTRICT_COUNTIES[d]) return DISTRICT_COUNTIES[d];
  const area = (d.match(/^[A-Z]{1,2}/) || [])[0];
  return (area && AREA_COUNTIES[area]) || null;
}
