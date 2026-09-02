-- Librélula · Colecciones públicas/privadas de biblioteca
-- Propuesta versionada. NO ejecutar en producción sin aprobación humana explícita.

create table if not exists public.library_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  accent_color text not null default '#b8896a',
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_collections_name_length check (char_length(trim(name)) between 1 and 80),
  constraint library_collections_description_length check (char_length(description) <= 280),
  constraint library_collections_visibility check (visibility in ('private', 'public')),
  constraint library_collections_accent_color check (accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

create table if not exists public.library_collection_books (
  collection_id uuid not null references public.library_collections(id) on delete cascade,
  book_id text not null references public.books(id) on delete cascade,
  sort_order integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (collection_id, book_id),
  constraint library_collection_books_sort_order check (sort_order >= 0)
);

create table if not exists public.library_collection_follows (
  collection_id uuid not null references public.library_collections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, user_id)
);

create index if not exists library_collections_owner_id_idx
  on public.library_collections(owner_id, updated_at desc);
create index if not exists library_collection_books_order_idx
  on public.library_collection_books(collection_id, sort_order, added_at);
create index if not exists library_collection_follows_collection_idx
  on public.library_collection_follows(collection_id, created_at desc);

alter table public.library_collections enable row level security;
alter table public.library_collection_books enable row level security;
alter table public.library_collection_follows enable row level security;

grant select, insert, update, delete on public.library_collections to authenticated;
grant select, insert, update, delete on public.library_collection_books to authenticated;
grant select, insert, delete on public.library_collection_follows to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collections' and policyname = 'library_collections_read_visible'
  ) then
    create policy library_collections_read_visible
    on public.library_collections for select to authenticated
    using (visibility = 'public' or owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collections' and policyname = 'library_collections_insert_own'
  ) then
    create policy library_collections_insert_own
    on public.library_collections for insert to authenticated
    with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collections' and policyname = 'library_collections_update_own'
  ) then
    create policy library_collections_update_own
    on public.library_collections for update to authenticated
    using (owner_id = auth.uid()) with check (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collections' and policyname = 'library_collections_delete_own'
  ) then
    create policy library_collections_delete_own
    on public.library_collections for delete to authenticated
    using (owner_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_books' and policyname = 'library_collection_books_read_visible'
  ) then
    create policy library_collection_books_read_visible
    on public.library_collection_books for select to authenticated
    using (
      exists (
        select 1 from public.library_collections c
        where c.id = library_collection_books.collection_id
          and (c.visibility = 'public' or c.owner_id = auth.uid())
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_books' and policyname = 'library_collection_books_insert_owner'
  ) then
    create policy library_collection_books_insert_owner
    on public.library_collection_books for insert to authenticated
    with check (
      exists (
        select 1 from public.library_collections c
        where c.id = library_collection_books.collection_id and c.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_books' and policyname = 'library_collection_books_update_owner'
  ) then
    create policy library_collection_books_update_owner
    on public.library_collection_books for update to authenticated
    using (
      exists (
        select 1 from public.library_collections c
        where c.id = library_collection_books.collection_id and c.owner_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from public.library_collections c
        where c.id = library_collection_books.collection_id and c.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_books' and policyname = 'library_collection_books_delete_owner'
  ) then
    create policy library_collection_books_delete_owner
    on public.library_collection_books for delete to authenticated
    using (
      exists (
        select 1 from public.library_collections c
        where c.id = library_collection_books.collection_id and c.owner_id = auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_follows' and policyname = 'library_collection_follows_read_visible'
  ) then
    create policy library_collection_follows_read_visible
    on public.library_collection_follows for select to authenticated
    using (
      user_id = auth.uid()
      or exists (
        select 1 from public.library_collections c
        where c.id = library_collection_follows.collection_id and c.visibility = 'public'
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_follows' and policyname = 'library_collection_follows_insert_self_public'
  ) then
    create policy library_collection_follows_insert_self_public
    on public.library_collection_follows for insert to authenticated
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.library_collections c
        where c.id = library_collection_follows.collection_id
          and c.visibility = 'public'
          and c.owner_id <> auth.uid()
      )
    );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'library_collection_follows' and policyname = 'library_collection_follows_delete_self'
  ) then
    create policy library_collection_follows_delete_self
    on public.library_collection_follows for delete to authenticated
    using (user_id = auth.uid());
  end if;
end $$;
