# ADR-0001: Entrega de emails de autenticación en producción

- Estado: Aceptado
- Fecha: 2026-08-30
- Alcance: Supabase Auth / registro / recuperación de contraseña

## Contexto

Librélula utiliza Supabase Auth para registro e inicio de sesión mediante email y contraseña. Los flujos de confirmación de alta y recuperación de contraseña dependen de un proveedor SMTP.

El SMTP incorporado de Supabase es adecuado para desarrollo, pero no para una aplicación pública: tiene límites estrictos y restringe la entrega a direcciones autorizadas del equipo. Por tanto, producción necesita SMTP propio aunque el proyecto continúe en el plan gratuito de Supabase.

## Decisión

Usar un proveedor SMTP externo con plan gratuito y conectarlo a Supabase Auth. La opción inicial seleccionada es Brevo Free, suficiente para la fase de portfolio/MVP y con soporte de email transaccional y SMTP.

La aplicación seguirá delegando tokens, expiración, sesiones y enlaces de recuperación en Supabase Auth. Librélula no almacenará contraseñas ni implementará tokens propios.

## Arquitectura

```text
Usuario
  │
  ▼
Librélula (Vercel)
  │ resetPasswordForEmail / signUp
  ▼
Supabase Auth
  │
  ▼
SMTP transaccional externo
  │
  ▼
Buzón del usuario
  │
  ▼
https://libr-lula.vercel.app/?auth=recovery
  │
  ▼
Supabase session + updateUser(password)
```

## Reglas

1. Nunca guardar credenciales SMTP en GitHub.
2. Las credenciales SMTP se configuran exclusivamente en Supabase Dashboard.
3. Nunca exponer `service_role` en Vite ni en código cliente.
4. La recuperación devuelve siempre un mensaje genérico para reducir enumeración de usuarios.
5. El redirect de producción debe ser `https://libr-lula.vercel.app`.
6. Los cambios de Auth deben pasar lint, build, preview de Vercel y QA manual antes de producción.

## Consecuencias

### Positivas

- Emails de registro y recuperación disponibles para usuarios externos.
- Coste 0 EUR en la fase inicial.
- Responsabilidades bien separadas: Vercel sirve la SPA, Supabase gestiona Auth y el SMTP entrega correo.
- Arquitectura sencilla de explicar y defender en portfolio.

### Limitaciones

- El plan gratuito del proveedor SMTP tiene límites de envío.
- La reputación y entregabilidad dependen del proveedor y, si se usa dominio propio, de SPF/DKIM/DMARC.
- Las credenciales del proveedor requieren gestión operativa fuera del repositorio.

## Alternativas descartadas

- SMTP incorporado de Supabase: no válido para usuarios externos en producción.
- Implementar recuperación propia: aumenta superficie de ataque y duplica funciones ya resueltas por Supabase Auth.
- Desactivar confirmación por email: reduce seguridad y no resuelve recuperación de contraseña.

## Referencias

- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/passwords
- https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan
