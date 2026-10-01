import LandingPage from "./pages/LandingPage";
import MockupCapture from "./pages/MockupCapture";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import Support from "./pages/Support";
import DeleteAccount from "./pages/DeleteAccount";
import Business from "./pages/Business";
import Treats from "./pages/Treats";
import Confirmed from "./pages/Confirmed";
import CreatorsPage from "./pages/CreatorsPage";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from "react";

// Lazy so the creator config (offer codes in src/data/creators.ts) ships in its
// own chunk, fetched only on /with/*, and never in the main bundle a homepage
// visitor downloads. Keeps the codes out of everything except the creator pages.
const CreatorPage = lazy(() => import("./pages/CreatorPage"));

// Discover section (/discover, /dog-friendly, /news, /events). Its build-time
// content JSON ships in this chunk only, so the homepage bundle does not grow.
const ResourcesRoutes = lazy(() => import("./pages/resources/ResourcesRoutes"));
const RESOURCE_SECTIONS = ["/discover", "/dog-friendly", "/news", "/events"];

const ROUTES: Record<string, () => JSX.Element> = {
  "/mockup": MockupCapture,
  "/privacy": PrivacyPolicy,
  "/terms": TermsOfUse,
  "/support": Support,
  "/delete-account": DeleteAccount,
  "/business": Business,
  "/treats": Treats,
  "/confirmed": Confirmed,
  "/creators": CreatorsPage,
};

export default function App() {
  const path = window.location.pathname;
  // Creator pages: /with/:slug. Parsed here so ROUTES stays an exact-match map.
  if (path.startsWith("/with/")) {
    const slug = decodeURIComponent(path.slice("/with/".length)).replace(/\/+$/, "");
    return (
      <Suspense fallback={null}>
        <CreatorPage slug={slug} />
      </Suspense>
    );
  }
  const clean = path.replace(/\/+$/, "") || "/";
  if (RESOURCE_SECTIONS.some((s) => clean === s || clean.startsWith(`${s}/`))) {
    return (
      <Suspense fallback={null}>
        <ResourcesRoutes path={clean} />
      </Suspense>
    );
  }
  // Exact-match lookup on the path without a trailing slash, so /privacy/ shows
  // the privacy page rather than falling through to the homepage.
  const Page = ROUTES[clean];
  if (Page) return <Page />;
  return clean === "/" ? <LandingPage /> : <NotFound />;
}
