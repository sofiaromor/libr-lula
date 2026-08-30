# Case study: Production-ready email authentication

## Problema

El login mostraba un enlace de recuperación de contraseña sin comportamiento y el registro dependía del SMTP incorporado de Supabase, que no es adecuado para usuarios externos en producción.

## Investigación

Se trazó el flujo completo entre React/Vite, Supabase Auth y Vercel. Se verificó que el despliegue no era la causa del problema y que la entrega de correo requería SMTP externo para una aplicación pública.

## Solución

- Implementación de `resetPasswordForEmail` con redirect controlado.
- Pantalla dedicada de actualización de contraseña.
- Uso de `updateUser` y cierre posterior de la sesión temporal de recuperación.
- Respuesta genérica para reducir enumeración de usuarios.
- Despliegue mediante PR y preview de Vercel antes de merge.
- CI con build completo y lint incremental para introducir calidad sin bloquear por deuda legacy.
- ADR, runbook y checklist de QA para trazabilidad operativa.

## Arquitectura

React/Vite se mantiene como cliente público. Supabase Auth conserva la responsabilidad sobre identidades, tokens, sesiones y recuperación. El proveedor SMTP externo se limita a la entrega transaccional. Vercel sirve el frontend y genera previews de cada cambio.

## Decisiones de ingeniería

### No crear un sistema de tokens propio

Supabase Auth ya implementa expiración y validación de recovery tokens. Duplicar esa lógica aumentaría superficie de ataque.

### Quality ratchet

El repositorio tenía deuda histórica de lint. En lugar de ignorar ESLint o bloquear todo el proyecto, el CI exige lint limpio para cada archivo fuente nuevo o modificado mientras ejecuta siempre el build completo. De esta forma la calidad solo puede mejorar a partir de la adopción del pipeline.

### Coste

La arquitectura se mantiene dentro de planes gratuitos para la fase inicial. El SMTP se selecciona entre proveedores con free tier y las credenciales se gestionan fuera del repositorio.

## Resultado esperado

Un usuario externo puede crear una cuenta, confirmar su email, recuperar su contraseña y volver a iniciar sesión mediante un flujo auditable y reproducible, con despliegue y quality gates automatizados.
