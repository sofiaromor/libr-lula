# Runbook: Auth email en producción

## Objetivo

Garantizar que registro, confirmación de email y recuperación de contraseña funcionen para usuarios externos en `https://libr-lula.vercel.app`.

## Dependencias

- Vercel: frontend de producción.
- Supabase: Auth, sesiones y usuarios.
- SMTP externo: entrega de correo transaccional.

## Configuración requerida en Supabase

### URL configuration

- Site URL: `https://libr-lula.vercel.app`
- Redirect URL permitida: `https://libr-lula.vercel.app/**`

### SMTP

Configurar en Authentication > Emails > SMTP Settings usando las credenciales del proveedor transaccional.

Nunca guardar host, usuario, contraseña o API keys privadas en el repositorio.

## Flujos de QA

### Alta

1. Abrir producción en una ventana privada.
2. Registrar una dirección externa de prueba.
3. Verificar que la UI informa de que debe confirmar el correo.
4. Comprobar recepción del mensaje.
5. Abrir el enlace de confirmación.
6. Confirmar que vuelve a `libr-lula.vercel.app`.
7. Iniciar sesión.
8. Verificar que se crea/carga el perfil y que la sesión persiste al recargar.

### Recuperación

1. Abrir Iniciar sesión.
2. Introducir el email de una cuenta existente.
3. Pulsar “¿Olvidaste tu contraseña?”.
4. Confirmar mensaje genérico de éxito.
5. Abrir el email de recuperación.
6. Confirmar que el enlace vuelve a `?auth=recovery`.
7. Introducir dos contraseñas iguales de al menos 6 caracteres.
8. Guardar.
9. Confirmar cierre de la sesión temporal de recovery.
10. Iniciar sesión con la contraseña nueva.
11. Confirmar que la contraseña anterior ya no funciona.

## Casos negativos

- Email inexistente: la UI no debe confirmar si existe o no una cuenta.
- Contraseñas distintas: no se debe llamar a `updateUser`.
- Contraseña demasiado corta: bloqueo en cliente y validación de Supabase.
- Enlace expirado o reutilizado: mostrar error y solicitar un enlace nuevo.
- SMTP no disponible: registrar el incidente; no exponer credenciales ni mensajes internos del proveedor.

## Observabilidad

- Supabase Auth Logs para errores de signup, recovery y verify.
- Vercel Deployments para verificar que la revisión que contiene el cambio está en producción.
- Proveedor SMTP para entregas, rebotes y bloqueos.

## Rollback

El cambio de frontend se revierte mediante Git/Vercel. La configuración SMTP es independiente y puede deshabilitarse desde Supabase Auth sin tocar código.
