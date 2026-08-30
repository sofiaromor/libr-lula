import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import MobileReaderDock from "./MobileReaderDock.jsx";
import GuestAccessGuard from "./GuestAccessGuard.jsx";
import HomeWarmup from "./HomeWarmup.jsx";
import ResetPasswordPage from "./ResetPasswordPage.jsx";
import "./MobileNavRefinement.css";
import "./GuestNavFix.css";
import "./MobilePolish.css";
import "./CozyDockIcons.css";
import "./CozyDockPreview.css";

const isPasswordRecovery =
  new URLSearchParams(window.location.search).get("auth") === "recovery";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isPasswordRecovery ? (
      <ResetPasswordPage />
    ) : (
      <>
        <HomeWarmup />
        <App />
        <MobileReaderDock />
        <GuestAccessGuard />
      </>
    )}
  </StrictMode>,
);
