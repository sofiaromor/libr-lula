import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const PerfilSupabaseImpl = lazy(() => import("./PerfilSupabaseImpl.jsx"));

export default function PerfilSupabase(props) {
  return (
    <DeferredPage title="Abriendo tu rincón…" text="Estamos reuniendo tus lecturas y recuerdos.">
      <PerfilSupabaseImpl {...props} />
    </DeferredPage>
  );
}
