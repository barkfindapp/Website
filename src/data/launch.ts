// Single source of truth for the pre-launch / post-launch switch.
// Flipped to live on release day, 13 October 2026 (see docs/launch-day-copy-changes.md).
export const LAUNCHED = true;
export const APP_STORE_URL = "https://apps.apple.com/gb/app/id6782144377";

// Android / Google Play switch. BarkFind for Android was submitted to Google Play
// production review on 28 November 2026. A Play link before Google approves opens
// "Item not found", so nothing points at Google Play until this is flipped.
// On the day Google approves, flip ANDROID_LIVE to true. That one-line change is
// the only thing needed: everything that mentions Android or links to Google Play
// is gated on it, and the "Android coming soon" wording shows while it is false.
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.barkfind.app";
export const ANDROID_LIVE = true;
