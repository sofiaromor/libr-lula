-- Librélula · Actividad lectora privada V9
-- Objetivo:
--   * Las publicaciones y avances de lectura NO son públicos para cualquier persona autenticada.
--   * Solo pueden verlos la propia autora, las personas que la siguen en Librélula
--     y quienes comparten al menos un club de lectura activo con ella.
--   * Se añade un hilo unificado por libro y una vista de la última actualización
--     para reutilizarla dentro de los clubes.
-- Idempotente. No borra publicaciones, avances, imágenes ni comentarios existentes.

begin;

create or replace function public.can_view_reader_activity(p_author_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_author_id is not null
    and auth.uid() is not null
    and (
      p_author_id = auth.uid()
      or exists (
        select 1
        from public.user_follows follows
        where follows.follower_id = auth.uid()
          and follows.following_id = p_author_id
      )
      or exists (
        select 1
        from public.reading_club_members mine
        join public.reading_club_members theirs
          on theirs.club_id = mine.club_id
         and theirs.status = 'active'
        where mine.user_id = auth.uid()
          and mine.status = 'active'
          and theirs.user_id = p_author_id
      )
    );
$$;

create or replace function public.can_view_reader_activity_legacy(p_legacy_user_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles profile
    where profile.legacy_id = p_legacy_user_id
      and public.can_view_reader_activity(profile.id)
  );
$$;

revoke execute on function public.can_view_reader_activity(uuid) from public, anon;
revoke execute on function public.can_view_reader_activity_legacy(bigint) from public, anon;
grant execute on function public.can_view_reader_activity(uuid) to authenticated;
grant execute on function public.can_view_reader_activity_legacy(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- Publicaciones y avances: lectura restringida al círculo permitido.
-- -----------------------------------------------------------------------------

drop policy if exists "reader posts authenticated read" on public.reader_posts;
drop policy if exists "reader posts circle read" on public.reader_posts;
create policy "reader posts circle read"
  on public.reader_posts
  for select
  to authenticated
  using (public.can_view_reader_activity(author_id));

drop policy if exists "reading progress authenticated read" on public.reading_progress_log;
drop policy if exists "reading progress circle read" on public.reading_progress_log;
create policy "reading progress circle read"
  on public.reading_progress_log
  for select
  to authenticated
  using (public.can_view_reader_activity_legacy(legacy_user_id));

-- -----------------------------------------------------------------------------
-- Resolver si una clave del feed pertenece a una actividad que la persona actual
-- puede ver. Protege también likes y comentarios asociados a actividad privada.
-- -----------------------------------------------------------------------------

create or replace function public.can_view_reader_activity_key(p_activity_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := coalesce(trim(p_activity_key), '');
  v_identifier text;
  v_author_id uuid;
  v_legacy_user_id bigint;
begin
  if auth.uid() is null or v_key = '' then
    return false;
  end if;

  if v_key like 'post:%' then
    v_identifier := split_part(v_key, ':', 2);
    if v_identifier !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return false;
    end if;

    select post.author_id
      into v_author_id
      from public.reader_posts post
     where post.id = v_identifier::uuid;

    return coalesce(public.can_view_reader_activity(v_author_id), false);
  end if;

  if v_key like 'progress:%' then
    v_identifier := split_part(v_key, ':', 2);
    if v_identifier !~ '^[0-9]+$' then
      return false;
    end if;

    select progress.legacy_user_id
      into v_legacy_user_id
      from public.reading_progress_log progress
     where progress.id = v_identifier::bigint;

    return coalesce(public.can_view_reader_activity_legacy(v_legacy_user_id), false);
  end if;

  if v_key like 'review:%' or v_key like 'status:%' then
    v_identifier := split_part(v_key, ':', 2);
    if v_identifier !~ '^[0-9]+$' then
      return false;
    end if;

    select user_book.legacy_user_id
      into v_legacy_user_id
      from public.user_books user_book
     where user_book.id = v_identifier::bigint;

    return coalesce(public.can_view_reader_activity_legacy(v_legacy_user_id), false);
  end if;

  return false;
end;
$$;

revoke execute on function public.can_view_reader_activity_key(text) from public, anon;
grant execute on function public.can_view_reader_activity_key(text) to authenticated;

drop policy if exists "activity likes authenticated read" on public.reader_activity_likes;
drop policy if exists "activity likes circle read" on public.reader_activity_likes;
create policy "activity likes circle read"
  on public.reader_activity_likes
  for select
  to authenticated
  using (public.can_view_reader_activity_key(activity_key));

drop policy if exists "activity likes own insert" on public.reader_activity_likes;
create policy "activity likes own insert"
  on public.reader_activity_likes
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_reader_activity_key(activity_key)
  );

drop policy if exists "activity comments authenticated read" on public.reader_activity_comments;
drop policy if exists "activity comments circle read" on public.reader_activity_comments;
create policy "activity comments circle read"
  on public.reader_activity_comments
  for select
  to authenticated
  using (public.can_view_reader_activity_key(activity_key));

drop policy if exists "activity comments own insert" on public.reader_activity_comments;
create policy "activity comments own insert"
  on public.reader_activity_comments
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_reader_activity_key(activity_key)
  );

-- -----------------------------------------------------------------------------
-- Imágenes de publicaciones: el bucket ya es privado, pero la lectura se limita
-- ahora al mismo círculo que puede ver la publicación. La carpeta raíz es author_id.
-- -----------------------------------------------------------------------------

drop policy if exists "reader post images authenticated read" on storage.objects;
drop policy if exists "reader post images circle read" on storage.objects;
create policy "reader post images circle read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'reader-post-images'
    and case
      when array_length(storage.foldername(name), 1) >= 1
       and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_view_reader_activity(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

-- -----------------------------------------------------------------------------
-- Hilo unificado de una persona para un libro.
-- Combina notas de progreso + publicaciones explícitamente vinculadas al libro.
-- -----------------------------------------------------------------------------

create or replace function public.reader_book_thread(
  p_book_id text,
  p_profile_id uuid default null
)
returns table (
  entry_id text,
  source text,
  body text,
  previous_progress integer,
  progress integer,
  pages_delta integer,
  spoiler boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_target uuid := coalesce(p_profile_id, auth.uid());
  v_legacy_id bigint;
begin
  if auth.uid() is null or p_book_id is null or trim(p_book_id) = '' or v_target is null then
    return;
  end if;

  if not public.can_view_reader_activity(v_target) then
    return;
  end if;

  select profile.legacy_id
    into v_legacy_id
    from public.profiles profile
   where profile.id = v_target;

  return query
  select *
  from (
    select
      'post:' || post.id::text as entry_id,
      'post'::text as source,
      nullif(trim(post.body), '') as body,
      null::integer as previous_progress,
      null::integer as progress,
      null::integer as pages_delta,
      post.spoiler,
      post.created_at
    from public.reader_posts post
    where post.author_id = v_target
      and post.book_id = trim(p_book_id)

    union all

    select
      'progress:' || progress_log.id::text as entry_id,
      'progress'::text as source,
      nullif(trim(progress_log.note), '') as body,
      progress_log.previous_progress,
      progress_log.new_progress as progress,
      progress_log.pages_delta,
      progress_log.spoiler,
      progress_log.created_at
    from public.reading_progress_log progress_log
    where v_legacy_id is not null
      and progress_log.legacy_user_id = v_legacy_id
      and progress_log.book_id = trim(p_book_id)
  ) entries
  order by entries.created_at desc;
end;
$$;

revoke execute on function public.reader_book_thread(text, uuid) from public, anon;
grant execute on function public.reader_book_thread(text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Última reflexión por persona y libro para las tarjetas del círculo del club.
-- Solo devuelve filas que el usuario actual está autorizado a ver.
-- -----------------------------------------------------------------------------

create or replace function public.reader_book_latest_updates(
  p_book_id text,
  p_profile_ids uuid[]
)
returns table (
  profile_id uuid,
  entry_id text,
  source text,
  body text,
  previous_progress integer,
  progress integer,
  pages_delta integer,
  spoiler boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with requested_profiles as (
    select distinct requested.requested_id as profile_id
    from unnest(coalesce(p_profile_ids, array[]::uuid[])) as requested(requested_id)
    where requested.requested_id is not null
      and public.can_view_reader_activity(requested.requested_id)
  ), candidates as (
    select
      post.author_id as profile_id,
      'post:' || post.id::text as entry_id,
      'post'::text as source,
      nullif(trim(post.body), '') as body,
      null::integer as previous_progress,
      null::integer as progress,
      null::integer as pages_delta,
      post.spoiler,
      post.created_at
    from public.reader_posts post
    join requested_profiles requested on requested.profile_id = post.author_id
    where post.book_id = trim(p_book_id)
      and nullif(trim(post.body), '') is not null

    union all

    select
      profile.id as profile_id,
      'progress:' || progress_log.id::text as entry_id,
      'progress'::text as source,
      nullif(trim(progress_log.note), '') as body,
      progress_log.previous_progress,
      progress_log.new_progress as progress,
      progress_log.pages_delta,
      progress_log.spoiler,
      progress_log.created_at
    from public.reading_progress_log progress_log
    join public.profiles profile on profile.legacy_id = progress_log.legacy_user_id
    join requested_profiles requested on requested.profile_id = profile.id
    where progress_log.book_id = trim(p_book_id)
      and nullif(trim(progress_log.note), '') is not null
  ), ranked as (
    select
      candidates.*,
      row_number() over (
        partition by candidates.profile_id
        order by candidates.created_at desc
      ) as row_number
    from candidates
  )
  select
    ranked.profile_id,
    ranked.entry_id,
    ranked.source,
    ranked.body,
    ranked.previous_progress,
    ranked.progress,
    ranked.pages_delta,
    ranked.spoiler,
    ranked.created_at
  from ranked
  where ranked.row_number = 1;
$$;

revoke execute on function public.reader_book_latest_updates(text, uuid[]) from public, anon;
grant execute on function public.reader_book_latest_updates(text, uuid[]) to authenticated;

commit;

-- Comprobación rápida. Todos deberían devolver true.
select
  to_regprocedure('public.can_view_reader_activity(uuid)') is not null as helper_privacidad,
  to_regprocedure('public.reader_book_thread(text,uuid)') is not null as hilo_privado,
  to_regprocedure('public.reader_book_latest_updates(text,uuid[])') is not null as ultimas_updates,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reader_posts'
      and policyname = 'reader posts circle read'
  ) as publicaciones_restringidas,
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'reading_progress_log'
      and policyname = 'reading progress circle read'
  ) as progresos_restringidos,
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'reader post images circle read'
  ) as imagenes_restringidas;
