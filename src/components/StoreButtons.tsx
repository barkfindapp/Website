import { PLAY_STORE_URL } from "../data/launch";

// Google Play has no official badge asset in the repo, so this is a text button.
// Pass the classes of the App Store control it sits next to so the two match;
// if an official Play badge is ever added to /public, swap this for an <img>.
export function GooglePlayButton({
  className,
  label = "Get it on Google Play",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <a href={PLAY_STORE_URL} aria-label={label} className={className}>
      {label}
    </a>
  );
}
