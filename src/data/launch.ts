// Single source of truth for the pre-launch / post-launch switch.
// The site is pre-launch until the App Store release button is pressed.
// On release day, flip both here (see docs/launch-day-copy-changes.md):
//   LAUNCHED       -> true
//   APP_STORE_URL  -> the real https://apps.apple.com/... listing URL
export const LAUNCHED = false;
export const APP_STORE_URL = "#download";
