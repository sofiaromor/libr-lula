function readableText(value) {
  if (typeof value === "string") return value.trim();
  if (value instanceof Error) return value.message.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function friendlyAuthError(error, fallback, { hasSupabaseConfig = true } = {}) {
  const messageCandidates = [
    error?.message,
    error?.error_description,
    error?.description,
    error?.details,
    error?.hint,
    error?.name,
  ];
  const message = messageCandidates.map(readableText).find(Boolean) || "";

  if (/failed to fetch|fetch failed|networkerror/i.test(message)) {
    return hasSupabaseConfig
      ? "No pudimos conectar con Librélula. Comprueba tu conexión e inténtalo de nuevo en unos segundos."
      : "Este preview no ha recibido la configuración de Supabase. Necesita un nuevo despliegue de Preview con las variables habilitadas.";
  }

  if (/smtp|email|mail|rate limit|unexpected_failure|sending|provider|authorized/i.test(message)) {
    return "No pudimos enviar el correo ahora mismo. Revisa que Brevo tenga autorizada la IP nueva y vuelve a intentarlo en unos minutos.";
  }

  return message || fallback;
}
