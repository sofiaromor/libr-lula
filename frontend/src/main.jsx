import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import MobileReaderDock from "./MobileReaderDock.jsx";
import GuestAccessGuard from "./GuestAccessGuard.jsx";
import "./MobileNavRefinement.css";
import "./GuestNavFix.css";
import "./MobilePolish.css";
import "./CozyDockIcons.css";
import "./CozyDockPreview.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <MobileReaderDock />
    <GuestAccessGuard />
  </StrictMode>,
);
