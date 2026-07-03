import { useState } from "react";
import { signInSupabase } from "./lib/session.js";
import "./LoginSupabase.css";

export default function LoginSupabase({ onLoginSuccess, onOpenCatalog }) {
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
      <section className="login-supabase-card">
        <button
          type="button"
          className="login-supabase-back"
          onClick={onOpenCatalog}
        >
          ← Volver al catálogo
        </button>

        <span className="login-supabase-kicker">Librélula</span>
        <h1>Iniciar sesión</h1>
        <p>
          Entra con el usuario creado en Supabase para recuperar tu biblioteca,
          perfil y lecturas.
        </p>

        <form className="login-supabase-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {errorMessage && (
            <p className="login-supabase-error">{errorMessage}</p>
          )}

          <button
            type="submit"
            className="login-supabase-submit"
            disabled={submitting}
          >
            {submitting ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
