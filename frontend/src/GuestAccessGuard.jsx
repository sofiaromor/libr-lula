import { useEffect, useState } from "react";

function syncAuthClass() {
  const hasUser = Boolean(document.querySelector(".user-btn"));
  const hasGuestButton = Boolean(document.querySelector(".btn-signin"));

  document.body.classList.toggle("is-reader-authenticated", hasUser);
  document.body.classList.toggle("is-reader-guest", !hasUser && hasGuestButton);
}

function openExistingLogin() {
  const button = document.querySelector(".btn-signin");
  if (!button) return false;
  button.click();
  return true;
}

export default function GuestAccessGuard() {
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    syncAuthClass();

    const root = document.getElementById("root");
    const observer = new MutationObserver(syncAuthClass);
    if (root) {
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    function protectGuestCatalog(event) {
      if (!document.body.classList.contains("is-reader-guest")) return;

      const exploreButton = event.target.closest?.(".inicio-primary-action");
      if (!exploreButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setGateOpen(true);
    }

    document.addEventListener("click", protectGuestCatalog, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", protectGuestCatalog, true);
      document.body.classList.remove("is-reader-authenticated", "is-reader-guest");
    };
  }, []);

  if (!gateOpen) return null;

  return (
    <div className="guest-access-layer" role="presentation">
      <button
        type="button"
        className="guest-access-backdrop"
        aria-label="Cerrar aviso"
        onClick={() => setGateOpen(false)}
      />
      <section
        className="guest-access-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-access-title"
      >
        <span className="guest-access-mark" aria-hidden="true">✦</span>
        <p>Tu rincón lector</p>
        <h2 id="guest-access-title">Inicia sesión para abrir el catálogo</h2>
        <span>
          El catálogo, tu biblioteca, los clubes y la actividad forman parte de tu espacio personal en Librélula.
        </span>
        <div>
          <button type="button" onClick={() => setGateOpen(false)}>
            Ahora no
          </button>
          <button
            type="button"
            className="is-primary"
            onClick={() => {
              setGateOpen(false);
              window.setTimeout(() => openExistingLogin(), 0);
            }}
          >
            Iniciar sesión
          </button>
        </div>
      </section>
    </div>
  );
}
