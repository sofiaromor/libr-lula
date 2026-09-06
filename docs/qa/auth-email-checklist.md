# QA checklist: autenticación por email

## Registro

- [ ] Usuario externo puede registrarse.
- [ ] La respuesta de UI no expone detalles internos del proveedor.
- [ ] Se recibe email de confirmación.
- [ ] El enlace confirma la cuenta y vuelve a Librélula.
- [ ] El usuario puede iniciar sesión tras confirmar.

## Recuperación de contraseña

- [ ] “¿Olvidaste tu contraseña?” exige email válido.
- [ ] La respuesta es genérica para evitar enumeración de usuarios.
- [ ] Se recibe email de recuperación.
- [ ] El enlace abre `?auth=recovery`.
- [ ] Contraseñas distintas se rechazan en cliente.
- [ ] Contraseña menor de 6 caracteres se rechaza.
- [ ] Contraseña válida se actualiza mediante Supabase Auth.
- [ ] La sesión temporal de recuperación se cierra después del cambio.
- [ ] La contraseña nueva permite iniciar sesión.
- [ ] La contraseña anterior deja de funcionar.

## Producción

- [x] Vercel production deployment READY.
- [x] Alias canónico `https://librelula.vercel.app` activo.
- [x] Flujo de recuperación implementado en frontend.
- [x] CI con build completo y lint incremental activo.
- [ ] SMTP externo gratuito configurado en Supabase.
- [ ] Site URL y redirect allowlist verificados en Supabase Dashboard.
- [ ] Prueba end-to-end realizada con una dirección externa.
