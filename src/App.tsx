import LandingPage from "./pages/LandingPage";
import MockupCapture from "./pages/MockupCapture";

export default function App() {
  if (window.location.pathname === "/mockup") {
    return <MockupCapture />;
  }
  return <LandingPage />;
}
