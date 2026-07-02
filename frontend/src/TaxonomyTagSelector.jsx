import { useMemo, useState } from "react";

import { parseTaxonomyItems, taxonomyKey } from "./bookTaxonomy.js";

export default function TaxonomyTagSelector({
  value,
  onChange,
  options,
  label,
  help,
  customLabel = "Otra etiqueta",
  customPlaceholder = "Escribe una etiqueta…",
  idPrefix = "taxonomy",
  maximum = 8,
}) {
  const selected = useMemo(() => parseTaxonomyItems(value, maximum), [maximum, value]);
  const [customValue, setCustomValue] = useState("");
  const [message, setMessage] = useState("");

  function emit(nextItems) {
    onChange?.(parseTaxonomyItems(nextItems, maximum));
    setMessage("");
  }

  function toggleItem(item) {
    const key = taxonomyKey(item);
    const exists = selected.some((current) => taxonomyKey(current) === key);

    if (exists) {
      emit(selected.filter((current) => taxonomyKey(current) !== key));
      return;
    }

    if (selected.length >= maximum) {
      setMessage(`Puedes guardar hasta ${maximum} etiquetas.`);
      return;
    }

    emit([...selected, item]);
  }

  function addCustom() {
    const cleanValue = customValue.trim().replace(/^[,;|]+|[,;|]+$/gu, "");
    if (!cleanValue) return;

    if (selected.some((item) => taxonomyKey(item) === taxonomyKey(cleanValue))) {
      setMessage("Esa etiqueta ya está seleccionada.");
      return;
    }

    if (selected.length >= maximum) {
      setMessage(`Puedes guardar hasta ${maximum} etiquetas.`);
      return;
    }

    emit([...selected, cleanValue]);
    setCustomValue("");
  }

  return (
    <div className="genre-tag-selector taxonomy-tag-selector">
      <div className="genre-tag-heading">
        <span>{label}</span>
        <small>{selected.length}/{maximum} seleccionadas</small>
      </div>

      {selected.length > 0 && (
        <div className="genre-selected-tags" aria-label={`${label} seleccionadas`}>
          {selected.map((item) => (
            <button
              key={item}
              type="button"
              className="genre-selected-tag"
              onClick={() => toggleItem(item)}
              aria-label={`Quitar ${item}`}
            >
              {item}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}

      <div className="genre-tag-options" aria-label={`${label} disponibles`}>
        {options.map((item) => {
          const active = selected.some((current) => taxonomyKey(current) === taxonomyKey(item));
          return (
            <button
              key={item}
              type="button"
              className={`genre-tag-option${active ? " is-selected" : ""}`}
              onClick={() => toggleItem(item)}
              aria-pressed={active}
            >
              {active && <span aria-hidden="true">✓</span>}
              {item}
            </button>
          );
        })}
      </div>

      <div className="genre-custom-row">
        <label htmlFor={`${idPrefix}-custom`}>{customLabel}</label>
        <div>
          <input
            id={`${idPrefix}-custom`}
            type="text"
            value={customValue}
            onChange={(event) => {
              setCustomValue(event.target.value);
              setMessage("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                addCustom();
              }
            }}
            maxLength={60}
            placeholder={customPlaceholder}
          />
          <button type="button" onClick={addCustom} disabled={!customValue.trim()}>
            + Añadir
          </button>
        </div>
      </div>

      {help && <small className="genre-tag-help">{help}</small>}
      {message && <small className="genre-tag-message" role="status">{message}</small>}
    </div>
  );
}
