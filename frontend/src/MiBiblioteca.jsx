import { lazy } from "react";
import DeferredPage from "./DeferredPage.jsx";

const MiBibliotecaImpl = lazy(() => import("./MiBibliotecaImpl.jsx"));

export default function MiBiblioteca(props) {
  return (
    <DeferredPage title="Abriendo tu biblioteca…" text="Estamos ordenando tus lecturas.">
      <MiBibliotecaImpl {...props} />
    </DeferredPage>
  );
}
