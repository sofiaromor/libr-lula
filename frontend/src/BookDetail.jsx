import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const BookDetailImpl = lazy(() => import("./BookDetailImpl.jsx"));

export default function BookDetail(props) {
  return (
    <DeferredPage title="Abriendo el libro…" text="Estamos preparando su ficha y tus notas de lectura.">
      <BookDetailImpl {...props} />
    </DeferredPage>
  );
}
