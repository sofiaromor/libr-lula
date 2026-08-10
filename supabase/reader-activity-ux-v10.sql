-- Librélula · V10
-- Última actividad del libro para el círculo:
-- si la acción más reciente fue un avance sin comentario, también debe aparecer.

begin;

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

select
  to_regprocedure('public.reader_book_latest_updates(text,uuid[])') is not null
    as ultima_actividad_disponible,
  has_function_privilege(
    'authenticated',
    'public.reader_book_latest_updates(text,uuid[])',
    'EXECUTE'
  ) as autenticadas_pueden_consultarla,
  not has_function_privilege(
    'anon',
    'public.reader_book_latest_updates(text,uuid[])',
    'EXECUTE'
  ) as anon_sigue_bloqueado;
