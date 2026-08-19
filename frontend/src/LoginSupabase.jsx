import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const LoginSupabaseImpl = lazy(() => import("./LoginSupabaseImpl.jsx"));

function openHomeAfterLogin() {
  window.setTimeout(() => {
    const homeButton = [...document.querySelectorAll(".site-nav-links button")].find(
      (button) => button.textContent?.trim() === "Inicio",
    );
    homeButton?.click();
  }, 0);
}

export default function LoginSupabase(props) {
  function handleLoginSuccess(session) {
    props.onLoginSuccess?.(session);
    openHomeAfterLogin();
  }

  return (
    <DeferredPage title="Preparando tu acceso…" text="Estamos abriendo la puerta de Librélula.">
      <LoginSupabaseImpl {...props} onLoginSuccess={handleLoginSuccess} />
    </DeferredPage>
  );
}
