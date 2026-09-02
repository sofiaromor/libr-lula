import { useEffect, useMemo, useRef, useState } from "react";
import "./SpineCropEditor.css";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function initialCrop(value = {}) {
  return {
    x: clamp(value.x ?? 50, 0, 100),
    y: clamp(value.y ?? 50, 0, 100),
    zoom: clamp(value.zoom ?? 1, MIN_ZOOM, MAX_ZOOM),
  };
}

export default function SpineCropEditor({
  file,
  book,
  initialValue,
  onCancel,
  onConfirm,
}) {
  const [crop, setCrop] = useState(() => initialCrop(initialValue));
  const [drag, setDrag] = useState(null);
  const previewRef = useRef(null);
  const imageUrl = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  function startDrag(event) {
    const point = event.touches?.[0] || event;
    setDrag({
      clientX: point.clientX,
      clientY: point.clientY,
      x: crop.x,
      y: crop.y,
    });
  }

  function moveDrag(event) {
    if (!drag || !previewRef.current) return;
    const point = event.touches?.[0] || event;
    const bounds = previewRef.current.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const deltaX = ((point.clientX - drag.clientX) / bounds.width) * 100;
    const deltaY = ((point.clientY - drag.clientY) / bounds.height) * 100;

    setCrop((current) => ({
      ...current,
      x: clamp(drag.x - deltaX, 0, 100),
      y: clamp(drag.y - deltaY, 0, 100),
    }));
  }

  function stopDrag() {
    setDrag(null);
  }

  if (!file) return null;

  return (
    <div className="spine-crop-backdrop" role="presentation" onMouseUp={stopDrag} onTouchEnd={stopDrag}>
      <section className="spine-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="spine-crop-title">
        <header>
          <div>
            <span className="profile-kicker">Lomo personal</span>
            <h2 id="spine-crop-title">Ajusta la foto</h2>
            <p>Mueve y amplía la imagen hasta que encaje como el lomo real de tu libro.</p>
          </div>
          <button type="button" className="spine-crop-close" onClick={onCancel} aria-label="Cerrar editor">×</button>
        </header>

        <div className="spine-crop-stage-wrap">
          <div
            ref={previewRef}
            className={`spine-crop-stage ${drag ? "is-dragging" : ""}`}
            onMouseDown={startDrag}
            onMouseMove={moveDrag}
            onMouseLeave={stopDrag}
            onTouchStart={startDrag}
            onTouchMove={moveDrag}
          >
            <img
              src={imageUrl}
              alt="Vista previa del recorte del lomo"
              draggable="false"
              style={{
                objectPosition: `${crop.x}% ${crop.y}%`,
                transform: `scale(${crop.zoom})`,
              }}
            />
            <span className="spine-crop-glass" aria-hidden="true" />
          </div>
          <div className="spine-crop-book-copy">
            <strong>{book?.title || "Tu libro"}</strong>
            <small>{book?.author || ""}</small>
          </div>
        </div>

        <div className="spine-crop-controls">
          <label>
            <span>Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={crop.zoom}
              onChange={(event) => setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))}
            />
          </label>
          <button type="button" className="spine-crop-reset" onClick={() => setCrop(initialCrop())}>Centrar</button>
        </div>

        <footer>
          <button type="button" className="profile-button secondary" onClick={onCancel}>Cancelar</button>
          <button type="button" className="profile-button primary" onClick={() => onConfirm?.(crop)}>Usar este recorte</button>
        </footer>
      </section>
    </div>
  );
}
