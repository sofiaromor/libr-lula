import "./Escritorio.css";

export default function Escritorio({ onNewStory }) {
  return (
    <main className="escritorio">
      <header className="escritorio-header">
        <p className="escritorio-eyebrow">LAUREL</p>
        <h1>Mi escritorio</h1>
        <p className="escritorio-intro">
          Tu espacio para escribir, crear y dar forma a tus historias.
        </p>
      </header>

      <section className="escritorio-stories" aria-labelledby="mis-historias">
        <div className="escritorio-section-heading">
          <div>
            <p className="escritorio-section-label">Tu espacio de escritura</p>
            <h2 id="mis-historias">Mis historias</h2>
          </div>
        </div>

        <button type="button" className="nueva-historia-card" onClick={onNewStory}>
          <span className="nueva-historia-icon" aria-hidden="true">+</span>
          <span className="nueva-historia-title">Nueva historia</span>
          <span className="nueva-historia-text">Empieza a construir una historia desde cero.</span>
        </button>
      </section>
    </main>
  );
}
