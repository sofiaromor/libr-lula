import { useState } from "react";
import { publicUrl } from "./api.js";
import { signInSupabase } from "./lib/session.js";
import "./LoginSupabase.css";

export default function LoginSupabase({ onLoginSuccess, onOpenCatalog }) {
  const [activePanel, setActivePanel] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");

    try {
      const session = await signInSupabase({
        email: email.trim(),
        password,
      });

      onLoginSuccess?.(session);
    } catch (error) {
      setErrorMessage(
        error.message || "No se pudo iniciar sesión. Revisa el email y la contraseña.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-supabase-page">
      <div className="lg-wrap">
        <div className="lg-left">
          <img
            src={publicUrl("images/fondo.png")}
            alt="Librería acogedora"
            className="lg-image"
          />
          <div className="lg-overlay" />
          <div className="lg-brand">
            <div className="lg-brand-title">Librélula</div>
            <div className="lg-brand-sub">Lectura · Historias · Imaginación</div>
          </div>
        </div>

        <div className="lg-right">
          <button
            type="button"
            className="lg-back"
            onClick={onOpenCatalog}
          >
            ← Volver al catálogo
          </button>

          <div className="lg-tabs" aria-label="Acceso a Librélula">
            <button
              type="button"
              className={`lg-tab${activePanel === "login" ? " active" : ""}`}
              onClick={() => setActivePanel("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`lg-tab${activePanel === "signup" ? " active" : ""}`}
              onClick={() => setActivePanel("signup")}
            >
              Registrarse
            </button>
          </div>

          {errorMessage && (
            <div className="lg-error">{errorMessage}</div>
          )}

          <section className={`lg-panel${activePanel === "login" ? " active" : ""}`}>
            <div className="lg-title">
              Bienvenida de <em>vuelta</em>
            </div>
            <div className="lg-sub">Tu rincón literario te espera</div>

            <form onSubmit={handleSubmit}>
              <div className="lg-fields">
                <div className="lg-field">
                  <label htmlFor="login-email">Correo electrónico</label>
                  <input
                    type="email"
                    id="login-email"
                    name="email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="login-pass">Contraseña</label>
                  <input
                    type="password"
                    id="login-pass"
                    name="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>

              <div className="lg-check">
                <input type="checkbox" id="remember" />
                <label htmlFor="remember">
                  Recordarme · <a href="#" onClick={(event) => event.preventDefault()}>¿Olvidaste tu contraseña?</a>
                </label>
              </div>

              <button type="submit" className="lg-btn" disabled={submitting}>
                {submitting ? "Entrando…" : "Entrar a mi rincón"}
              </button>
            </form>

            <div className="lg-switch">
              ¿No tienes cuenta?{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setActivePanel("signup");
                  setErrorMessage("");
                }}
              >
                Regístrate
              </a>
            </div>
          </section>

          <section className={`lg-panel${activePanel === "signup" ? " active" : ""}`}>
            <div className="lg-title">
              Únete a <em>Librélula</em>
            </div>
            <div className="lg-sub">Empieza tu aventura literaria hoy</div>

            <div className="lg-note">
              <p>
                El registro con Supabase se activará cuando migremos esta parte.
                De momento entra con el usuario ya creado para la migración.
              </p>
            </div>

            <button
              type="button"
              className="lg-btn"
              onClick={() => setActivePanel("login")}
            >
              Volver a iniciar sesión
            </button>

            <div className="lg-switch">
              ¿Ya tienes cuenta?{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setActivePanel("login");
                  setErrorMessage("");
                }}
              >
                Inicia sesión
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
