import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// Public reviews feed for the marketing site. Server-side only: it calls a
// SECURITY DEFINER function (get_public_reviews) that joins profiles for the
// author's first name + town, which the browser cannot read under RLS.
// Keeps @supabase/supabase-js out of the browser bundle by design.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

type Review = {
  id: string;
  paw_rating: number;
  review_text: string;
  images: string[];
  location_name: string;
  author_first_name: string | null;
  author_town: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(200).json({ count: 0, reviews: [] });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("get_public_reviews", { _limit: 12 });
    if (error) throw error;

    const reviews = (data ?? []) as Review[];

    // Reviews don't need to be fresh to the minute.
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({ count: reviews.length, reviews });
  } catch (err) {
    console.error("reviews error:", err);
    return res.status(200).json({ count: 0, reviews: [] });
  }
}
