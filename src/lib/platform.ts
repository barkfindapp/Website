// Minimal user-agent platform check. CreatorPage reads it inline (that page
// renders null until its data loads, so there is no prerendered markup to match).
// LandingPage's "show both forms" behaviour is intentionally left as is and is
// not retrofitted onto this helper.
import { useEffect, useState } from "react";

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

// Hydration-safe hook form. Returns false on the server and on the first client
// render (so it matches the prerendered HTML), then flips to true after mount on
// an Android device. Use this where the markup is prerendered, for example the
// homepage, so reordering the store buttons on Android never trips a hydration
// mismatch.
export function useIsAndroid(): boolean {
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(isAndroid()), []);
  return android;
}
