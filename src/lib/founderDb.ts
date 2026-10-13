// Founder offer status, over the same public REST endpoint as the creator pages.
// public.founder_offer_status() returns { open, code, cap }. The page only needs
// `open` for the UI; the code is used server-side only (api/founder.ts) to build
// the redeem link, never in the browser.
const REST = "https://kwwnwniyijeuorpbyvmn.supabase.co/rest/v1";
const KEY = "sb_publishable_-EWszMqW22vM4kNYHeq7xQ_JXMsX4MR";

// Whether founding places are still open. On any failure returns true so the
// sign-up still shows; api/founder re-checks before it sends anything.
export async function fetchFounderOpen(timeoutMs = 6000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${REST}/rpc/founder_offer_status`, {
      method: "POST",
      headers: { apikey: KEY, "content-type": "application/json" },
      body: "{}",
      signal: ctrl.signal,
    });
    if (!res.ok) return true;
    const data = (await res.json().catch(() => null)) as { open?: boolean } | null;
    return data && typeof data.open === "boolean" ? data.open : true;
  } catch {
    return true;
  } finally {
    clearTimeout(timer);
  }
}
