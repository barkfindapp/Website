import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import BetaLanding from "./pages/BetaLanding.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BetaLanding />
  </StrictMode>
);
