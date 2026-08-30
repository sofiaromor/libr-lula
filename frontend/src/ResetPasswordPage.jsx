import { useState } from "react";
import { publicUrl } from "./api.js";
import { supabase } from "./lib/supabase.js";
import "./LoginSupabase.css";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (password.length < 6) {
      setErrorMessage("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSuccessMessage("Contraseña actualizada. Ya puedes iniciar sesión con tu nueva contraseña.");
      await supabase.auth.signOut();

      window.setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("auth");
        url.hash = "";
        window.location.assign(url.toString());
      }, 1200);
    } catch (error) {
      setErrorMessage(
        String(error?.message || "No pudimos actualizar la contraseña. Solicita un nuevo enlace e inténtalo otra vez."),
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
          <div className="lg-title">
            Elige una <em>contraseña nueva</em>
          </div>
          <div className="lg-sub">
            Usa una contraseña que no hayas utilizado antes en Librélula.
          </div>

          {errorMessage && <div className="lg-error">{errorMessage}</div>}
          {successMessage && (
            <div className="lg-note">
              <p>{successMessage}</p>
            </div>
          )}

          <section className="lg-panel active">
            <form onSubmit={handleSubmit}>
              <div className="lg-fields">
                <div className="lg-field">
                  <label htmlFor="new-password">Nueva contraseña</label>
                  <input
                    type="password"
                    id="new-password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>

                <div className="lg-field">
                  <label htmlFor="confirm-password">Repite la contraseña</label>
                  <input
                    type="password"
                    id="confirm-password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="lg-btn" disabled={submitting || Boolean(successMessage)}>
                {submitting ? "Actualizando…" : "Guardar nueva contraseña"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
