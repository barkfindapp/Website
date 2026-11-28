import { PLAY_STORE_URL } from "../data/launch";

// Official "Get it on Google Play" badge (public/google-play-badge.png, taken
// from Google's own badge resource and kept unaltered, as the guidelines
// require). `className` sizes the image: pass a height that matches the App Store
// control it sits beside (h-[52px] next to the App Store badge). `wrapClassName`
// is for layout of the link itself, for example centring it in a column.
export function GooglePlayButton({
  className = "h-[52px] w-auto",
  wrapClassName = "inline-flex items-center hover:opacity-90 transition-opacity",
  label = "Get it on Google Play",
}: {
  className?: string;
  wrapClassName?: string;
  label?: string;
}) {
  return (
    <a href={PLAY_STORE_URL} aria-label={label} className={wrapClassName}>
      <img src="/google-play-badge.png" alt={label} className={className} />
    </a>
  );
}
