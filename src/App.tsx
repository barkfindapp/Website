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
import { lazy, Suspense } from "react";

// Lazy so the creator config (offer codes in src/data/creators.ts) ships in its
// own chunk, fetched only on /with/*, and never in the main bundle a homepage
// visitor downloads. Keeps the codes out of everything except the creator pages.
const CreatorPage = lazy(() => import("./pages/CreatorPage"));

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
  const Page = ROUTES[path];
  return Page ? <Page /> : <LandingPage />;
}
