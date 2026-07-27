import LandingPage from "./pages/LandingPage";
import MockupCapture from "./pages/MockupCapture";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import Support from "./pages/Support";
import DeleteAccount from "./pages/DeleteAccount";
import Business from "./pages/Business";

const ROUTES: Record<string, () => JSX.Element> = {
  "/mockup": MockupCapture,
  "/privacy": PrivacyPolicy,
  "/terms": TermsOfUse,
  "/support": Support,
  "/delete-account": DeleteAccount,
  "/business": Business,
};

export default function App() {
  const Page = ROUTES[window.location.pathname];
  return Page ? <Page /> : <LandingPage />;
}
