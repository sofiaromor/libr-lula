-- Librélula · Clubes V13
-- Estado de lectura del Chat general por miembro.
-- Requiere Clubes V12.

begin;

alter table public.reading_club_members
  add column if not exists last_general_chat_read_at timestamptz;

-- Al instalar la mejora no convertimos mensajes históricos ya vistos en "no leídos".
update public.reading_club_members
set last_general_chat_read_at = now()
where last_general_chat_read_at is null;

alter table public.reading_club_members
  alter column last_general_chat_read_at set default now();

alter table public.reading_club_members
  alter column last_general_chat_read_at set not null;

create or replace function public.reading_club_general_unread_count(p_club_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_read timestamptz;
  v_reading_id bigint;
  v_count bigint := 0;
begin
  if v_user_id is null then
    return 0;
  end if;

  select m.last_general_chat_read_at, c.current_reading_id
    into v_last_read, v_reading_id
  from public.reading_club_members m
  join public.reading_clubs c on c.id = m.club_id
  where m.club_id = p_club_id
    and m.user_id = v_user_id
    and m.status = 'active';

  if not found then
    return 0;
  end if;

  select count(*)
    into v_count
  from public.reading_club_posts p
  where p.club_id = p_club_id
    and p.channel = 'general'
    and p.user_id <> v_user_id
    and p.reading_id is not distinct from v_reading_id
    and p.created_at > v_last_read;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.mark_reading_club_general_chat_read(p_club_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  update public.reading_club_members
  set last_general_chat_read_at = now()
  where club_id = p_club_id
    and user_id = v_user_id
    and status = 'active';

  if not found then
    raise exception 'No perteneces a este club.';
  end if;
end;
$$;

revoke execute on function public.reading_club_general_unread_count(bigint) from public;
revoke execute on function public.mark_reading_club_general_chat_read(bigint) from public;
revoke execute on function public.reading_club_general_unread_count(bigint) from anon;
revoke execute on function public.mark_reading_club_general_chat_read(bigint) from anon;

grant execute on function public.reading_club_general_unread_count(bigint) to authenticated;
grant execute on function public.mark_reading_club_general_chat_read(bigint) to authenticated;

commit;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reading_club_members'
      and column_name = 'last_general_chat_read_at'
  ) as marca_de_lectura_creada,
  to_regprocedure('public.reading_club_general_unread_count(bigint)') is not null
    as contador_no_leidos_disponible,
  to_regprocedure('public.mark_reading_club_general_chat_read(bigint)') is not null
    as marcar_leido_disponible,
  not has_function_privilege(
    'anon',
    'public.reading_club_general_unread_count(bigint)',
    'EXECUTE'
  ) as anon_bloqueado;
