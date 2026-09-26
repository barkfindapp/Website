// Thin wrapper over the Plausible script loaded in index.html. Fire-and-forget:
// analytics must never break a page, and ad blockers remove the script for a
// share of visitors, so plausible may be undefined.
//
// Plausible Starter plan: custom event PROPERTIES are not included, so pass NO
// second argument. Filter events by page in the dashboard instead (the creator
// slug is already in the URL).
//
// Note: the App Store buttons on the homepage get NO event. Plausible's
// outbound-link tracking already counts clicks to apps.apple.com, so an extra
// event here would double count. (Those buttons are #download anchors until
// launch day; they become real App Store links then.)
export function track(event: string) {
  try {
    (window as unknown as { plausible?: (e: string) => void }).plausible?.(event);
  } catch {
    // ignore: analytics must never throw
  }
}
