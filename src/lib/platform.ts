// Minimal user-agent platform checks. CreatorPage reads isAndroid inline (that
// page renders null until its data loads, so there is no prerendered markup to
// match). LandingPage's "show both forms" behaviour is intentionally left as is
// and is not retrofitted onto this helper.
import { useEffect, useState } from "react";
import { ANDROID_LIVE, APP_STORE_URL, PLAY_STORE_URL } from "../data/launch";

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Device-aware download target for a single call-to-action button. Sends an
// Android phone to Google Play (once Android is live) and an iPhone to the App
// Store; on desktop or any device we cannot read, it points at the homepage
// download section, which shows both store badges, so we never guess a store.
// Hydration-safe: the server and the first client render return the agnostic
// "/#download" target, then it resolves to the device's store after mount.
export function useDownloadHref(): string {
  const [href, setHref] = useState("/#download");
  useEffect(() => {
    if (ANDROID_LIVE && isAndroid()) setHref(PLAY_STORE_URL);
    else if (isIOS()) setHref(APP_STORE_URL);
    else setHref("/#download");
  }, []);
  return href;
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
