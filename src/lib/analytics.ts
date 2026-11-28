// Thin wrapper over the Plausible script loaded in index.html. Fire-and-forget:
// analytics must never break a page, and ad blockers remove the script for a
// share of visitors, so plausible may be undefined.
//
// Plausible Starter plan: custom event PROPERTIES are not included, so pass NO
// second argument. Filter events by page in the dashboard instead (the creator
// slug is already in the URL).
//
// Note: the store buttons on the homepage get NO event. Plausible's
// outbound-link tracking already counts clicks to apps.apple.com, and it counts
// play.google.com the same way once the Google Play button is live, so an extra
// event here would double count.
export function track(event: string) {
  try {
    (window as unknown as { plausible?: (e: string) => void }).plausible?.(event);
  } catch {
    // ignore: analytics must never throw
  }
}
