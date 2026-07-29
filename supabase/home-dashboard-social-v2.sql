-- Librélula · Actividad lectora V2
-- Imágenes en publicaciones, referencias de libros y comentarios de progreso.
-- Idempotente: puede ejecutarse más de una vez.

begin;

alter table public.reader_posts
  add column if not exists image_path text;

alter table public.reading_progress_log
  add column if not exists note text;

alter table public.reading_progress_log
  add column if not exists spoiler boolean not null default false;

create index if not exists reader_posts_book_date_idx
  on public.reader_posts(book_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reader-post-images',
  'reader-post-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Las imágenes solo pueden leerse con sesión iniciada.
drop policy if exists "reader post images authenticated read" on storage.objects;
create policy "reader post images authenticated read"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'reader-post-images');

-- Cada persona escribe únicamente dentro de su propia carpeta auth.uid().
drop policy if exists "reader post images own insert" on storage.objects;
create policy "reader post images own insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'reader-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reader post images own update" on storage.objects;
create policy "reader post images own update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'reader-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'reader-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "reader post images own delete" on storage.objects;
create policy "reader post images own delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'reader-post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;

select
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reader_posts' and column_name = 'image_path') as publicaciones_con_imagen,
  exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'reading_progress_log' and column_name = 'note') as progresos_con_comentario,
  exists(select 1 from storage.buckets where id = 'reader-post-images') as bucket_imagenes;
