import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const BooksCatalogImpl = lazy(() => import("./BooksCatalogImpl.jsx"));

export default function BooksCatalog(props) {
  return (
    <DeferredPage title="Abriendo el catálogo…" text="Estamos colocando los libros en sus estanterías.">
      <BooksCatalogImpl {...props} />
    </DeferredPage>
  );
}
