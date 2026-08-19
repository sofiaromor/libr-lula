import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const LoginSupabaseImpl = lazy(() => import("./LoginSupabaseImpl.jsx"));

export default function LoginSupabase(props) {
  return (
    <DeferredPage title="Preparando tu acceso…" text="Estamos abriendo la puerta de Librélula.">
      <LoginSupabaseImpl {...props} />
    </DeferredPage>
  );
}
