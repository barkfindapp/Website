// Creator programme calls to Supabase, over plain fetch against the REST
// endpoint so the creator pages do not pull in supabase-js. The publishable key
// is the same public one used on /reset-password: anon-level access only.
// creators_public shows active creators only; creator_apply is the one write
// anon is allowed, and it validates everything itself.
import type { Creator } from "../data/creators";

const REST = "https://kwwnwniyijeuorpbyvmn.supabase.co/rest/v1";
const KEY = "sb_publishable_-EWszMqW22vM4kNYHeq7xQ_JXMsX4MR";
const HEADERS = { apikey: KEY, "content-type": "application/json" };

// One active creator by slug. Resolves to null when there is no such row, and
// rejects when the request itself fails, so the caller can fall back.
export async function fetchCreator(slug: string, timeoutMs = 6000): Promise<Creator | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${REST}/creators_public?slug=eq.${encodeURIComponent(slug)}&select=slug,display_name,handle,offer_code&limit=1`,
      { headers: HEADERS, signal: ctrl.signal },
    );
    if (!res.ok) throw new Error(`creators_public ${res.status}`);
    const rows: { slug: string; display_name: string; handle: string | null; offer_code: string | null }[] = await res.json();
    const r = rows[0];
    if (!r || !r.offer_code) return null;
    return { slug: r.slug, displayName: r.display_name, handle: r.handle || undefined, offerCode: r.offer_code, active: true };
  } finally {
    clearTimeout(timer);
  }
}

export type Application = {
  displayName: string;
  primaryHandle: string;
  handles: { instagram?: string; tiktok?: string; facebook?: string };
  followers: number | null;
  platform: string;
  accountEmail: string;
  contactEmail: string;
  termsVersion: string;
  agreed: boolean;
  signature: string;
};

export type ApplyResult = { ok: true; already?: boolean } | { ok: false; error: string };

export async function applyAsCreator(a: Application): Promise<ApplyResult> {
  const res = await fetch(`${REST}/rpc/creator_apply`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      p_display_name: a.displayName,
      p_primary_handle: a.primaryHandle,
      p_handles: a.handles,
      p_followers: a.followers,
      p_platform: a.platform,
      p_account_email: a.accountEmail,
      p_contact_email: a.contactEmail,
      p_terms_version: a.termsVersion,
      p_agreed: a.agreed,
      p_signature: a.signature,
    }),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok || !out || typeof out.ok !== "boolean") {
    return { ok: false, error: "That did not send. Try again in a minute." };
  }
  return out.ok ? { ok: true, already: !!out.already } : { ok: false, error: String(out.error || "That did not send.") };
}
