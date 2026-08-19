import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const EditBookImpl = lazy(() => import("./EditBookImpl.jsx"));

export default function EditBook(props) {
  return (
    <DeferredPage title="Preparando la edición…" text="Estamos abriendo la ficha editorial.">
      <EditBookImpl {...props} />
    </DeferredPage>
  );
}
