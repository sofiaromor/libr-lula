import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const PerfilSupabaseImpl = lazy(() => import("./PerfilSupabaseImpl.jsx"));
const ProfileCollectionsStandalone = lazy(() => import("./ProfileCollectionsStandalone.jsx"));

export default function PerfilSupabase(props) {
  const activeTab = props.activeTab || "summary";

  return (
    <DeferredPage title="Abriendo tu rincón…" text="Estamos reuniendo tus lecturas y recuerdos.">
      <PerfilSupabaseImpl {...props} />
      {activeTab === "summary" ? (
        <ProfileCollectionsStandalone
          profileId={props.profileId}
          onSelectBook={props.onSelectBook}
        />
      ) : null}
    </DeferredPage>
  );
}
