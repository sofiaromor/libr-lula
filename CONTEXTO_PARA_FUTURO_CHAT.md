# Librélula — contexto para continuar en otro chat

Copia actualizada: 20260624_190244
Ruta local habitual: C:\Users\sofia\Desktop\Librélula

## Estado funcional

- Catálogo React compilado en catalogo/ y fuentes en rontend/src/.
- Backend PHP con SQLite en database/librelula.db.
- Búsqueda externa mediante Open Library y respaldo de Google Books.
- Estados de lectura: Pendiente, Leyendo, Pausado, Leído, Abandonado y Releyendo.
- Valoraciones, reseñas, sensaciones, atmósfera y post-its.
- Favoritos de libros y autores.
- Géneros múltiples y taxonomía separada para temas, público y estética.

## Clasificación actual

Los filtros principales usan géneros literarios normalizados en español. Las etiquetas crudas de Goodreads/Open Library se convierten a categorías como Fantasía, Romance, Novela policíaca, Juvenil, Ciencia ficción, etc. Las etiquetas de idioma y ruido bibliográfico no se muestran como géneros.

Los libros del catálogo se ordenan por año de publicación descendente: primero 2026, después 2025, 2024, etc. Los libros sin año aparecen al final.

## Reglas para futuros cambios

1. Leer este archivo y revisar la estructura antes de modificar nada.
2. No reemplazar database/librelula.db por una base vacía o antigua.
3. Crear siempre un respaldo de archivos y base de datos antes de migrar.
4. Mantener separados géneros, temas, público, sensaciones, atmósfera y estética.
5. Recompilar React y copiar los recursos generados a catalogo/.
6. Conservar la codificación UTF-8 sin corromper tildes.