begin;

alter table public.profiles
  add column if not exists cover_image text;

alter table public.user_books
  add column if not exists added_at timestamptz;

update public.user_books
set added_at = coalesce(
  started_at::timestamptz,
  finished_at::timestamptz,
  paused_at::timestamptz,
  dropped_at::timestamptz,
  now()
)
where added_at is null;

alter table public.user_books
  alter column added_at set default now();

alter table public.user_books
  alter column added_at set not null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-covers',
  'profile-covers',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile covers public read" on storage.objects;
create policy "profile covers public read"
on storage.objects
for select
to public
using (bucket_id = 'profile-covers');

drop policy if exists "profile covers own insert" on storage.objects;
create policy "profile covers own insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile covers own update" on storage.objects;
create policy "profile covers own update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile covers own delete" on storage.objects;
create policy "profile covers own delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-covers'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'cover_image'
  ) as perfiles_con_portada,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_books'
      and column_name = 'added_at'
  ) as biblioteca_con_fecha,
  exists (
    select 1
    from storage.buckets
    where id = 'profile-covers'
  ) as bucket_portadas;
