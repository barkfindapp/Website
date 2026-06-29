import LandingPage from "./pages/LandingPage";
import MockupCapture from "./pages/MockupCapture";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";

export default function App() {
  const path = window.location.pathname;
  if (path === "/mockup") {
    return <MockupCapture />;
  }
  if (path === "/privacy") {
    return <PrivacyPolicy />;
  }
  if (path === "/terms") {
    return <TermsOfUse />;
  }
  return <LandingPage />;
}
