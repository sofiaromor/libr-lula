# Supabase - Librélula

Este directorio guarda el esquema base versionado de Supabase para Librélula.

## Orden recomendado

1. Revisar `schema.sql`.
2. Pegar `schema.sql` en Supabase SQL Editor.
3. Ejecutarlo una vez.
4. Confirmar que las tablas existen.
5. Marcar tu perfil como admin desde Supabase, no desde el frontend.

## Nota sobre admin

Para poder crear libros desde el frontend con la sesión actual, el usuario debe tener `profiles.is_admin = true`.
No se usa `service_role` en el frontend.

## Pendiente posterior

- Storage para portadas, PDF y EPUB.
- Importación externa desde Open Library / Google Books.
- Clubes de lectura y feed social real.
