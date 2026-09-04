-- Librélula · Mi biblioteca · Lomos personales
-- Infraestructura privada por usuario y libro.
-- Requiere aprobación humana antes de ejecutarse en producción.

begin;

create table if not exists public.user_book_spines (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  storage_path text not null,
  crop_x numeric(6,3) not null default 50,
  crop_y numeric(6,3) not null default 50,
  crop_zoom numeric(5,3) not null default 1,
  show_text boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id),
  constraint user_book_spines_storage_path_length
    check (char_length(storage_path) between 1 and 512),
  constraint user_book_spines_crop_x_range
    check (crop_x >= 0 and crop_x <= 100),
  constraint user_book_spines_crop_y_range
    check (crop_y >= 0 and crop_y <= 100),
  constraint user_book_spines_crop_zoom_range
    check (crop_zoom >= 1 and crop_zoom <= 3)
);

alter table public.user_book_spines
add column if not exists show_text boolean not null default false;

comment on column public.user_book_spines.show_text is
'Controls whether Librélula renders automatic title text over a personal spine image.';

create index if not exists user_book_spines_book_id_idx
on public.user_book_spines (book_id);

alter table public.user_book_spines enable row level security;

revoke all on table public.user_book_spines from public, anon;
grant select, insert, update, delete on public.user_book_spines to authenticated;

drop policy if exists user_book_spines_select_own on public.user_book_spines;
create policy user_book_spines_select_own
on public.user_book_spines
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists user_book_spines_insert_own_library on public.user_book_spines;
create policy user_book_spines_insert_own_library
on public.user_book_spines
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    join public.user_books ub
      on ub.legacy_user_id = p.legacy_id
    where p.id = (select auth.uid())
      and ub.book_id = user_book_spines.book_id
  )
);

drop policy if exists user_book_spines_update_own_library on public.user_book_spines;
create policy user_book_spines_update_own_library
on public.user_book_spines
for update
to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.profiles p
    join public.user_books ub
      on ub.legacy_user_id = p.legacy_id
    where p.id = (select auth.uid())
      and ub.book_id = user_book_spines.book_id
  )
);

drop policy if exists user_book_spines_delete_own on public.user_book_spines;
create policy user_book_spines_delete_own
on public.user_book_spines
for delete
to authenticated
using (user_id = (select auth.uid()));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'library-spines',
  'library-spines',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists library_spines_select_own on storage.objects;
create policy library_spines_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'library-spines'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists library_spines_insert_own on storage.objects;
create policy library_spines_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'library-spines'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists library_spines_update_own on storage.objects;
create policy library_spines_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'library-spines'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'library-spines'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists library_spines_delete_own on storage.objects;
create policy library_spines_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'library-spines'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;
