import StoryBand from "../StoryBand";

// Real photographs of Mylo only. Flip once at least two are supplied.
const HAS_PHOTOS = false;
const PHOTO_PORTRAIT = "/media/mylo-portrait.jpg";
const PHOTO_LANDSCAPE = "/media/mylo-landscape.jpg";

// The beta "Meet Mylo" band, now rendered through the shared StoryBand. Output
// is unchanged: same label, copy, photo placeholders and layout.
export default function MyloStory() {
  return (
    <StoryBand
      label="Meet Mylo"
      paragraphs={[
        <p>Mylo is a Vizsla. Rust-red, permanently attached to my leg, and physically incapable of being left at home.</p>,
        <p>Which turns out to be the whole problem. Finding places that genuinely want a dog, rather than just tolerate one, is harder than it ought to be.</p>,
        <p>So we built the app for him: the map, the reviews, the AI that borrows his name. All of it started with one dog who had to come everywhere.</p>,
        <p className="text-white font-semibold">The colour you see across BarkFind is his coat.</p>,
      ]}
      photos={[
        { alt: "Mylo the Vizsla", src: HAS_PHOTOS ? PHOTO_PORTRAIT : undefined, placeholderLabel: "Photo of Mylo (portrait)" },
        { alt: "Mylo out and about", src: HAS_PHOTOS ? PHOTO_LANDSCAPE : undefined, placeholderLabel: "Photo of Mylo (out and about)" },
      ]}
    />
  );
}
