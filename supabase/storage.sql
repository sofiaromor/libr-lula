-- Librélula Storage: portadas de libros
-- Ejecutar en Supabase SQL Editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-covers',
  'book-covers',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'book_covers_select_public'
  ) then
    create policy book_covers_select_public
    on storage.objects
    for select
    to public
    using (bucket_id = 'book-covers');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'book_covers_insert_admin'
  ) then
    create policy book_covers_insert_admin
    on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'book-covers'
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.is_admin = true
      )
    );
  end if;
end $$;
