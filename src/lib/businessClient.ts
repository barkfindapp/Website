// Browser Supabase client for the business portal (/business/claim and, later,
// /business/manage). Owners sign in with an ordinary account, and the session is
// kept so they stay signed in across the portal. The publishable key is the same
// public anon-level key used on /reset-password and the creator pages.
//
// Every portal read and write goes through /api/business with the access token in
// the Authorization header; this file never talks to the database directly.
import { createClient, type Session } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kwwnwniyijeuorpbyvmn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-EWszMqW22vM4kNYHeq7xQ_JXMsX4MR";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "barkfind-business-auth",
  },
});

export type { Session };

export type BusinessResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Calls one /api/business op with the signed-in session token. Returns a tagged
// result rather than throwing, so pages can show the message inline.
export async function callBusiness<T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<BusinessResult<T>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: "Please sign in again." };
  let res: Response;
  try {
    res = await fetch("/api/business", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ op, args }),
    });
  } catch {
    return { ok: false, error: "No connection. Check your internet and try again." };
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) return { ok: false, error: (body && body.error) || "Something went wrong. Try again." };
  return { ok: true, data: (body.data ?? body) as T };
}
