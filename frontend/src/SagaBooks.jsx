import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const SagaBooksImpl = lazy(() => import("./SagaBooksImpl.jsx"));

export default function SagaBooks(props) {
  return (
    <DeferredPage title="Reuniendo la saga…" text="Estamos colocando los volúmenes en orden.">
      <SagaBooksImpl {...props} />
    </DeferredPage>
  );
}
