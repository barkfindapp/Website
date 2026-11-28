import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// "Dog-friendly places near you" taster for the homepage. Reads the visitor's
// approximate location from Vercel's geo headers (no permission prompt, no third
// party), finds dog-friendly venues around them and returns the nearest,
// best-rated handful. Ranking uses the rating, but the rating itself is never
// sent to the client: the website keeps ratings and Mylo's verdict in the app.
// Server-side only, so @supabase/supabase-js stays out of the browser bundle.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Fallback when a request carries no geo (localhost, or geo stripped): central
// Bristol, where coverage is strong, so the section still fills in development.
const DEFAULT = { lat: 51.4545, lng: -2.5879, city: "Bristol" };

const POLICY_LABEL: Record<string, string> = {
  welcome: "Dogs welcome",
  restricted: "Dogs in parts",
};

type Place = {
  id: string;
  name: string;
  town: string | null;
  policy: string | null;
  policyLabel: string | null;
  image: string | null;
  imageCredit: string | null;
  imageCreditUrl: string | null;
  distanceKm: number;
};

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nearer bands come first; within a band the better-rated venue wins.
function band(d: number) {
  return d <= 25 ? 0 : d <= 50 ? 1 : d <= 100 ? 2 : 3;
}

// UK Google addresses read "<street>, <Town> <POSTCODE>, UK". The town is the
// last comma segment before the country, with the postcode stripped.
function townOf(address: string | null): string | null {
  if (!address) return null;
  const a = address.replace(/,?\s*(UK|United Kingdom)\s*$/i, "").trim();
  const seg = a.split(",").map((s) => s.trim()).filter(Boolean).pop() || "";
  const town = seg.replace(/\s+[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?\s*$/i, "").trim();
  return town || seg || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const h = req.headers;
  const latH = Number(h["x-vercel-ip-latitude"]);
  const lngH = Number(h["x-vercel-ip-longitude"]);
  const rawCity = h["x-vercel-ip-city"];
  const cityH = typeof rawCity === "string" ? safeDecode(rawCity) : "";
  const hasGeo = Number.isFinite(latH) && Number.isFinite(lngH);
  const lat = hasGeo ? latH : DEFAULT.lat;
  const lng = hasGeo ? lngH : DEFAULT.lng;
  const city = cityH || (hasGeo ? "you" : DEFAULT.city);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(200).json({ city, places: [] });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Prefilter to a box around the visitor (~±2.5deg lat, ±3.5deg lng) and take
    // a generous, well-rated candidate pool. Final proximity + rating ranking is
    // done below so a great venue 10km away beats a great one 150km away.
    const { data, error } = await supabase
      .from("locations")
      .select(
        "id,name,address,latitude,longitude,dog_policy,image_url,image_credit,image_credit_url,barkfind_rating,google_rating,review_count"
      )
      .eq("flagged", false)
      .in("dog_policy", ["welcome", "restricted"])
      .not("image_url", "is", null)
      .gte("latitude", lat - 2.5)
      .lte("latitude", lat + 2.5)
      .gte("longitude", lng - 3.5)
      .lte("longitude", lng + 3.5)
      .order("google_rating", { ascending: false, nullsFirst: false })
      .limit(400);
    if (error) throw error;

    const rows = (data ?? []) as Record<string, unknown>[];
    const scored = rows
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => {
        const dist = haversine(lat, lng, Number(r.latitude), Number(r.longitude));
        const score = Number(r.barkfind_rating ?? r.google_rating ?? 0);
        const reviews = Number(r.review_count ?? 0);
        return { r, dist, score, reviews };
      })
      .filter((x) => x.dist <= 200);

    scored.sort(
      (a, b) =>
        band(a.dist) - band(b.dist) || b.score - a.score || b.reviews - a.reviews
    );

    const seen = new Set<string>();
    const places: Place[] = [];
    for (const x of scored) {
      const name = String(x.r.name ?? "").trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      const policy = (x.r.dog_policy as string) ?? null;
      places.push({
        id: String(x.r.id),
        name,
        town: townOf((x.r.address as string) ?? null),
        policy,
        policyLabel: (policy && POLICY_LABEL[policy]) ?? null,
        image: (x.r.image_url as string) ?? null,
        imageCredit: (x.r.image_credit as string) ?? null,
        imageCreditUrl: (x.r.image_credit_url as string) ?? null,
        distanceKm: Math.round(x.dist * 10) / 10,
      });
      if (places.length >= 12) break;
    }

    // Per-visitor (geo) result: keep it out of shared caches, let the browser
    // hold it briefly.
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({ city, places });
  } catch {
    return res.status(200).json({ city, places: [] });
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
