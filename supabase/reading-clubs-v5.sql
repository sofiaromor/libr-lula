-- Librélula · Clubes de lectura V5
-- Ejecutar después de reading-clubs-v4.sql.
-- Conecta Clubes con Inicio y evita depender de una próxima cita almacenada
-- que puede quedarse obsoleta simplemente por el paso del tiempo.
-- Idempotente: puede ejecutarse más de una vez.

begin;

-- ---------------------------------------------------------------------------
-- 1. Próxima cita calculada en tiempo real.
--    Para clubes públicos puede consultarse la fecha; para clubes privados,
--    únicamente sus miembros/propietaria pueden obtenerla.
-- ---------------------------------------------------------------------------

drop function if exists public.reading_club_next_meetings(bigint[]);

create function public.reading_club_next_meetings(p_club_ids bigint[])
returns table (
  club_id bigint,
  next_meeting_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as club_id,
    min(m.starts_at) filter (where m.starts_at >= now()) as next_meeting_at
  from public.reading_clubs c
  left join public.reading_club_meetings m
    on m.club_id = c.id
   and m.starts_at >= now()
  where c.id = any(coalesce(p_club_ids, array[]::bigint[]))
    and (
      c.visibility = 'public'
      or c.owner_id = auth.uid()
      or exists (
        select 1
        from public.reading_club_members self_membership
        where self_membership.club_id = c.id
          and self_membership.user_id = auth.uid()
          and self_membership.status = 'active'
      )
    )
  group by c.id
  order by c.id;
$$;

revoke all on function public.reading_club_next_meetings(bigint[]) from public;
grant execute on function public.reading_club_next_meetings(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Resumen de Clubes para Inicio.
--    Solo devuelve clubes en los que auth.uid() es miembro activo. La próxima
--    cita se obtiene de reading_club_meetings en cada carga, no de un cache.
-- ---------------------------------------------------------------------------

drop function if exists public.reading_club_home_snapshot();

create function public.reading_club_home_snapshot()
returns table (
  club_id bigint,
  club_name text,
  visibility text,
  role text,
  current_chapter integer,
  current_page integer,
  progress integer,
  joined_at timestamptz,
  book_id text,
  book_title text,
  book_author text,
  book_cover text,
  book_pages integer,
  next_meeting_id bigint,
  next_meeting_title text,
  next_meeting_at timestamptz,
  next_meeting_ends_at timestamptz,
  next_meeting_location text,
  next_meeting_type text,
  club_total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select
      c.id as club_id,
      c.name as club_name,
      c.visibility,
      m.role,
      greatest(1, coalesce(m.current_chapter, 1))::integer as current_chapter,
      greatest(0, coalesce(m.current_page, 0))::integer as current_page,
      greatest(0, least(100, coalesce(m.progress, 0)))::integer as progress,
      m.joined_at,
      c.current_book_id as book_id,
      b.title as book_title,
      b.author as book_author,
      b.cover as book_cover,
      greatest(0, coalesce(b.pages, 0))::integer as book_pages,
      count(*) over ()::bigint as club_total
    from public.reading_club_members m
    join public.reading_clubs c
      on c.id = m.club_id
    left join public.books b
      on b.id = c.current_book_id
    where auth.uid() is not null
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
  select
    mine.club_id,
    mine.club_name,
    mine.visibility,
    mine.role,
    mine.current_chapter,
    mine.current_page,
    mine.progress,
    mine.joined_at,
    mine.book_id,
    mine.book_title,
    mine.book_author,
    mine.book_cover,
    mine.book_pages,
    next_meeting.id as next_meeting_id,
    next_meeting.title as next_meeting_title,
    next_meeting.starts_at as next_meeting_at,
    next_meeting.ends_at as next_meeting_ends_at,
    next_meeting.location as next_meeting_location,
    next_meeting.event_type as next_meeting_type,
    mine.club_total
  from mine
  left join lateral (
    select
      meeting.id,
      meeting.title,
      meeting.starts_at,
      meeting.ends_at,
      meeting.location,
      meeting.event_type
    from public.reading_club_meetings meeting
    where meeting.club_id = mine.club_id
      and meeting.starts_at >= now()
    order by meeting.starts_at asc, meeting.id asc
    limit 1
  ) next_meeting on true
  order by
    (next_meeting.starts_at is null) asc,
    next_meeting.starts_at asc nulls last,
    mine.joined_at desc
  limit 12;
$$;

revoke all on function public.reading_club_home_snapshot() from public;
grant execute on function public.reading_club_home_snapshot() to authenticated;

commit;

-- Comprobación rápida. Ambos indicadores deberían ser true.
select
  to_regprocedure('public.reading_club_next_meetings(bigint[])') is not null as proximas_citas_en_vivo,
  to_regprocedure('public.reading_club_home_snapshot()') is not null as clubes_en_inicio;
