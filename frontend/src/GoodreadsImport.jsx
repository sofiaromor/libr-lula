import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const GoodreadsImportImpl = lazy(() => import("./GoodreadsImportImpl.jsx"));

export default function GoodreadsImport(props) {
  return (
    <DeferredPage title="Preparando el importador…" text="Estamos preparando la mesa de trabajo del catálogo.">
      <GoodreadsImportImpl {...props} />
    </DeferredPage>
  );
}
