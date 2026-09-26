// Minimal user-agent platform check. CreatorPage is its only caller for now.
// LandingPage's "show both forms" behaviour is intentionally left as is and is
// not retrofitted onto this helper.
export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}
