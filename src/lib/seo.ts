import { useEffect } from "react";

// Lightweight, dependency-free head management for our hand-rolled router.
// Each route is a full page load (links are real <a href>), so we only need to
// set tags on mount. Written to be prerender-friendly: a static-site-generation
// pass (react-snap / vite-react-ssg) serialises the <head> after this runs, so
// the same code that helps client navigation also bakes real tags into the HTML
// that non-JS crawlers and AI answer engines read.

export const SITE_URL = "https://www.barkfind.com";
const SITE_NAME = "BarkFind";
const DEFAULT_IMAGE = `${SITE_URL}/onboarding-mockup-1.png`;

type SeoConfig = {
  title: string;
  description: string;
  path: string; // canonical path, e.g. "/treats" or "/"
  image?: string; // absolute URL or site-root path
  noindex?: boolean;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function toAbsolute(url: string) {
  return url.startsWith("http") ? url : `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function useSeo(config: SeoConfig) {
  useEffect(() => {
    const canonical = `${SITE_URL}${config.path}`;
    const image = toAbsolute(config.image ?? DEFAULT_IMAGE);

    document.title = config.title;
    upsertMeta("name", "description", config.description);
    upsertLink("canonical", canonical);
    upsertMeta("name", "robots", config.noindex ? "noindex, nofollow" : "index, follow");

    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:title", config.title);
    upsertMeta("property", "og:description", config.description);
    upsertMeta("property", "og:url", canonical);
    upsertMeta("property", "og:image", image);

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", config.title);
    upsertMeta("name", "twitter:description", config.description);
    upsertMeta("name", "twitter:image", image);

    // JSON-LD structured data (id-tagged so re-runs replace rather than stack).
    const existing = document.head.querySelectorAll('script[data-seo-jsonld="true"]');
    existing.forEach((n) => n.remove());
    if (config.jsonLd) {
      const blocks = Array.isArray(config.jsonLd) ? config.jsonLd : [config.jsonLd];
      for (const block of blocks) {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.setAttribute("data-seo-jsonld", "true");
        script.textContent = JSON.stringify(block);
        document.head.appendChild(script);
      }
    }
  }, [config.title, config.description, config.path, config.image, config.noindex, config.jsonLd]);
}

// --- Shared structured-data building blocks ---

export const organizationSchema: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "BarkFind",
  legalName: "BarkFind Limited",
  url: SITE_URL,
  logo: `${SITE_URL}/barkfind-logo.png`,
  sameAs: ["https://www.instagram.com/barkfind", "https://www.tiktok.com/@barkfindapp"],
  areaServed: { "@type": "Country", name: "United Kingdom" },
};

export const softwareApplicationSchema: Record<string, unknown> = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "BarkFind",
  applicationCategory: "TravelApplication",
  operatingSystem: "iOS",
  description:
    "BarkFind is a UK app for finding dog-friendly places, cafes, pubs, parks, restaurants and more, reviewed by dog owners on one map.",
  url: SITE_URL,
  offers: [
    {
      "@type": "Offer",
      price: "5.99",
      priceCurrency: "GBP",
      description: "Monthly subscription",
    },
    {
      "@type": "Offer",
      price: "39.99",
      priceCurrency: "GBP",
      description: "Annual subscription",
    },
  ],
};

export function faqSchema(items: { q: string; a: string }[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
