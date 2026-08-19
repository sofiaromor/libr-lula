import { Suspense } from "react";

export default function DeferredPage({ children, title = "Preparando tu rincón…", text = "Un momento, estamos abriendo estas páginas." }) {
  return (
    <Suspense
      fallback={
        <section className="lector-empty-state" aria-live="polite">
          <h3>{title}</h3>
          <p>{text}</p>
        </section>
      }
    >
      {children}
    </Suspense>
  );
}
