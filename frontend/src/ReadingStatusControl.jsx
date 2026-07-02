import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { appUrl } from "./api.js";

import { READING_STATUSES, READING_STATUS_BY_VALUE } from "./readingStatuses.js";

const VIEWPORT_MARGIN = 12;
const MENU_GAP = 8;

export default function ReadingStatusControl({
  currentStatus,
  isLoggedIn,
  loading = false,
  saving = false,
  onSelect,
  emptyLabel = "+ Añadir a mi biblioteca",
  menuTitle = "Guardar como…",
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const controlRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const status = READING_STATUS_BY_VALUE[currentStatus] || null;

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutside(event) {
      const insideControl = controlRef.current?.contains(event.target);
      const insideMenu = menuRef.current?.contains(event.target);
      if (!insideControl && !insideMenu) setOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return undefined;

    function positionMenu() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const triggerRect = trigger.getBoundingClientRect();
      const measuredHeight = menuRef.current?.offsetHeight || 360;
      const width = Math.min(
        Math.max(220, triggerRect.width),
        Math.max(220, window.innerWidth - VIEWPORT_MARGIN * 2),
      );
      const maxHeight = Math.max(180, window.innerHeight - VIEWPORT_MARGIN * 2);
      const menuHeight = Math.min(measuredHeight, maxHeight);
      const roomBelow = window.innerHeight - triggerRect.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const roomAbove = triggerRect.top - MENU_GAP - VIEWPORT_MARGIN;
      const openUpward = roomBelow < menuHeight && roomAbove > roomBelow;

      let left = triggerRect.left;
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));

      let top = openUpward
        ? triggerRect.top - MENU_GAP - menuHeight
        : triggerRect.bottom + MENU_GAP;
      top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - menuHeight - VIEWPORT_MARGIN));

      setMenuPosition({
        left,
        top,
        width,
        maxHeight,
        transformOrigin: openUpward ? "bottom center" : "top center",
      });
    }

    positionMenu();
    const animationFrame = window.requestAnimationFrame(positionMenu);

    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  function stopCardAction(event) {
    event.stopPropagation();
  }

  if (!isLoggedIn) {
    return (
      <a
        className={`catalog-status-login ${className}`.trim()}
        href={appUrl("login.php")}
        onClick={stopCardAction}
        onKeyDown={stopCardAction}
      >
        Iniciar sesión para guardar
      </a>
    );
  }

  const menu = open && !saving && typeof document !== "undefined"
    ? createPortal(
        <div
          className="catalog-status-menu catalog-status-menu-portal"
          role="menu"
          aria-label="Elegir estado de lectura"
          ref={menuRef}
          style={menuPosition ? {
            left: `${menuPosition.left}px`,
            top: `${menuPosition.top}px`,
            width: `${menuPosition.width}px`,
            maxHeight: `${menuPosition.maxHeight}px`,
            transformOrigin: menuPosition.transformOrigin,
            visibility: "visible",
          } : { visibility: "hidden" }}
          onClick={stopCardAction}
          onKeyDown={stopCardAction}
        >
          <span className="catalog-status-menu-title">{menuTitle}</span>
          {READING_STATUSES.map((option) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={currentStatus === option.value}
              className={currentStatus === option.value ? "is-current" : ""}
              key={option.value}
              onClick={() => {
                setOpen(false);
                onSelect(option.value);
              }}
            >
              <span className={`catalog-status-dot status-${option.value}`} aria-hidden="true" />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              {currentStatus === option.value && <b aria-hidden="true">✓</b>}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        className={`catalog-status-control${open ? " is-open" : ""} ${className}`.trim()}
        ref={controlRef}
        onClick={stopCardAction}
        onKeyDown={stopCardAction}
      >
        <button
          ref={triggerRef}
          type="button"
          className={`catalog-status-trigger${status ? ` status-${currentStatus}` : ""}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={loading || saving}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{saving ? "Guardando…" : status?.label || emptyLabel}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>
      {menu}
    </>
  );
}
