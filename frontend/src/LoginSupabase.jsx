import { useState } from "react";
import { publicUrl } from "./api.js";
import { signInSupabase, signUpSupabase } from "./lib/session.js";
import "./LoginSupabase.css";

export default function LoginSupabase({ onLoginSuccess, onOpenCatalog }) {
  const [activePanel, setActivePanel] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function switchPanel(panel) {
    setActivePanel(panel);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

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

  async function handleSignupSubmit(event) {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const session = await signUpSupabase({
        email: email.trim(),
        password,
        username: signupUsername.trim(),
      });

      if (session?.needsEmailConfirmation) {
        setSuccessMessage(
          "Cuenta creada. Te hemos enviado un correo para confirmar tu email antes de iniciar sesión.",
        );
        setActivePanel("login");
        return;
      }

      onLoginSuccess?.(session);
    } catch (error) {
      setErrorMessage(
        error.message || "No se pudo crear la cuenta. Revisa los datos e inténtalo otra vez.",
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
              onClick={() => switchPanel("login")}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={`lg-tab${activePanel === "signup" ? " active" : ""}`}
              onClick={() => switchPanel("signup")}
            >
              Registrarse
            </button>
          </div>

          {errorMessage && (
            <div className="lg-error">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="lg-note">
              <p>{successMessage}</p>
            </div>
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
                  switchPanel("signup");
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

            <form onSubmit={handleSignupSubmit}>
              <div className="lg-fields">
                <div className="lg-field">
                  <label htmlFor="signup-username">Nombre de usuario</label>
                  <input
                    type="text"
                    id="signup-username"
                    name="username"
                    placeholder="tu_nombre"
                    autoComplete="username"
                    required
                    value={signupUsername}
                    onChange={(event) => setSignupUsername(event.target.value)}
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="signup-email">Correo electrónico</label>
                  <input
                    type="email"
                    id="signup-email"
                    name="email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="signup-pass">Contraseña</label>
                  <input
                    type="password"
                    id="signup-pass"
                    name="password"
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="lg-btn" disabled={submitting}>
                {submitting ? "Creando cuenta…" : "Crear mi cuenta"}
              </button>
            </form>

            <div className="lg-switch">
              ¿Ya tienes cuenta?{" "}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  switchPanel("login");
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