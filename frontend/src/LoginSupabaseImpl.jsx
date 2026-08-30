import { useState } from "react";
import { publicUrl } from "./api.js";
import {
  getAuthRedirectUrl,
  resendSignupConfirmation,
  signInSupabase,
  signUpSupabase,
} from "./lib/session.js";
import { supabase } from "./lib/supabase.js";
import "./LoginSupabase.css";

const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

function friendlyAuthError(error, fallback) {
  const message = String(error?.message || "").trim();

  if (/failed to fetch|fetch failed|networkerror/i.test(message)) {
    return hasSupabaseConfig
      ? "No pudimos conectar con Librélula. Comprueba tu conexión e inténtalo de nuevo en unos segundos."
      : "Este preview no ha recibido la configuración de Supabase. Necesita un nuevo despliegue de Preview con las variables habilitadas.";
  }

  return message || fallback;
}

function goHomeAfterAuth() {
  window.setTimeout(() => {
    const homeButton = [...document.querySelectorAll(".site-nav-links button")].find(
      (button) => button.textContent?.trim() === "Inicio",
    );
    homeButton?.click();
  }, 0);
}

function getRecoveryRedirectUrl() {
  const url = new URL(getAuthRedirectUrl());
  url.searchParams.set("auth", "recovery");
  return url.toString();
}

export default function LoginSupabase({ onLoginSuccess, onOpenCatalog }) {
  const [activePanel, setActivePanel] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  function switchPanel(panel) {
    setActivePanel(panel);
    setPendingConfirmationEmail("");
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
      goHomeAfterAuth();
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No se pudo iniciar sesión. Revisa el email y la contraseña.",
        ),
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
    setPendingConfirmationEmail("");

    try {
      const session = await signUpSupabase({
        email: email.trim(),
        password,
        username: signupUsername.trim(),
      });

      if (session?.needsEmailConfirmation) {
        setPendingConfirmationEmail(session.email || email.trim().toLowerCase());
        setSuccessMessage(
          "Tu cuenta está pendiente de confirmar. Revisa tu correo y la carpeta de spam. Si no recibes el mensaje, puedes reenviarlo desde aquí.",
        );
        setActivePanel("login");
        return;
      }

      onLoginSuccess?.(session);
      goHomeAfterAuth();
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No se pudo crear la cuenta. Revisa los datos e inténtalo otra vez.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendConfirmation(event) {
    event.preventDefault();
    const confirmationEmail = pendingConfirmationEmail || email.trim().toLowerCase();

    if (!confirmationEmail) {
      setErrorMessage("Escribe el correo electrónico de tu cuenta.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      await resendSignupConfirmation(confirmationEmail);
      setSuccessMessage(
        "Hemos solicitado un nuevo correo de verificación. Revisa tu bandeja de entrada y spam; por seguridad, los reenvíos pueden tener un pequeño límite de frecuencia.",
      );
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No pudimos reenviar el correo de verificación. Inténtalo de nuevo en unos minutos.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setErrorMessage("Escribe el correo electrónico de tu cuenta.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");
    setPendingConfirmationEmail("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: getRecoveryRedirectUrl(),
      });

      if (error) throw error;

      setSuccessMessage(
        "Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisa también spam y correo no deseado.",
      );
    } catch (error) {
      setErrorMessage(
        friendlyAuthError(
          error,
          "No pudimos enviar el correo de recuperación. Inténtalo de nuevo en unos minutos.",
        ),
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
              {pendingConfirmationEmail && (
                <p>
                  <a href="#" onClick={handleResendConfirmation}>
                    {submitting ? "Reenviando…" : "Reenviar correo de verificación"}
                  </a>
                </p>
              )}
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
                  Recordarme ·{" "}
                  <a
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      switchPanel("forgot");
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </a>
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

          <section className={`lg-panel${activePanel === "forgot" ? " active" : ""}`}>
            <div className="lg-title">
              Recupera tu <em>contraseña</em>
            </div>
            <div className="lg-sub">
              Te enviaremos un enlace seguro para elegir una contraseña nueva.
            </div>

            <form onSubmit={handleForgotPassword}>
              <div className="lg-fields">
                <div className="lg-field">
                  <label htmlFor="recovery-email">Correo electrónico</label>
                  <input
                    type="email"
                    id="recovery-email"
                    name="recovery-email"
                    placeholder="tu@correo.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="lg-btn" disabled={submitting}>
                {submitting ? "Enviando…" : "Enviar enlace de recuperación"}
              </button>
            </form>

            <div className="lg-switch">
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  switchPanel("login");
                }}
              >
                Volver a iniciar sesión
              </a>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
