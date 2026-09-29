// Town-to-county labels for the /dog-friendly/ guide index.
//
// The database has no county data, so this static map is the only source of
// county labels on the website. The build (scripts/build-resources.mjs) finds
// each published town's most common postcode district from the venue data,
// then looks it up here: a district entry wins, otherwise the area entry.
//
// Extend this by hand when content_geo_scope grows (e.g. a new "EX" area, or a
// district that needs a different label from the rest of its area). A town
// whose postcode matches nothing here is listed under "Other areas" and the
// build prints a warning naming it, so a gap is visible rather than guessed.

// Postcode area (letters only) -> county label.
export const AREA_COUNTIES = {
  BS: "Bristol and North Somerset",
  TA: "Somerset",
};

// Postcode district -> county label. Overrides the area label for that district.
// Empty for now; add entries such as { BS37: "South Gloucestershire" } as needed.
export const DISTRICT_COUNTIES = {};

export const UNMAPPED_COUNTY = "Other areas";

export function countyForDistrict(district) {
  if (!district) return null;
  const d = String(district).toUpperCase();
  if (DISTRICT_COUNTIES[d]) return DISTRICT_COUNTIES[d];
  const area = (d.match(/^[A-Z]{1,2}/) || [])[0];
  return (area && AREA_COUNTIES[area]) || null;
}
