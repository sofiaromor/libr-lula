# SMTP setup required

Estado: pendiente de credenciales externas.

Librélula ya implementa registro con confirmación y recuperación de contraseña en frontend. Para entregar emails a usuarios externos, Supabase Auth necesita un SMTP externo.

## Opción seleccionada

Brevo Free (0 EUR/mes en la fase inicial).

## Datos que deben existir antes de activar producción

- SMTP host
- SMTP port
- SMTP username
- SMTP password/key
- Sender email verificado
- Sender name: Librélula

Estos valores son secretos operativos y no deben añadirse al repositorio.

## Configuración objetivo en Supabase

Authentication > Emails > SMTP Settings

Después de guardar las credenciales:

1. Site URL: `https://librelula.vercel.app`
2. Redirect allowlist: `https://librelula.vercel.app/**`
3. Confirm signup habilitado.
4. Ejecutar la checklist `docs/qa/auth-email-checklist.md` con una dirección externa.

## Definition of Done

- Registro externo recibe confirmación.
- Confirmación devuelve a Librélula.
- Recovery externo recibe email.
- Recovery abre `?auth=recovery`.
- Password update funciona.
- Login con nueva contraseña funciona.
- Auth logs no muestran errores de SMTP/redirect.
