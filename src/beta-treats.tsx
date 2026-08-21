import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import BetaTreats from "./pages/BetaTreats.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BetaTreats />
  </StrictMode>
);
