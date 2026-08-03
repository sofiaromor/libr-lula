-- Librélula · Clubes de lectura V3
-- Plan de lectura, desbloqueo periódico, páginas por capítulo,
-- progreso sincronizado y herramientas de moderación.
-- Idempotente: puede ejecutarse más de una vez.

begin;

alter table public.reading_clubs
  add column if not exists reading_plan_enabled boolean not null default false,
  add column if not exists reading_plan_unlocked_chapter integer not null default 1,
  add column if not exists reading_plan_next_unlock_at timestamptz,
  add column if not exists reading_plan_interval_days integer not null default 7,
  add column if not exists reading_plan_chapters_per_period integer not null default 1;

alter table public.reading_clubs
  drop constraint if exists reading_clubs_plan_unlocked_check;
alter table public.reading_clubs
  add constraint reading_clubs_plan_unlocked_check
  check (reading_plan_unlocked_chapter >= 1);

alter table public.reading_clubs
  drop constraint if exists reading_clubs_plan_interval_check;
alter table public.reading_clubs
  add constraint reading_clubs_plan_interval_check
  check (reading_plan_interval_days between 1 and 365);

alter table public.reading_clubs
  drop constraint if exists reading_clubs_plan_chapters_check;
alter table public.reading_clubs
  add constraint reading_clubs_plan_chapters_check
  check (reading_plan_chapters_per_period between 1 and 50);

alter table public.reading_club_chapters
  add column if not exists end_page integer;

alter table public.reading_club_member_achievements
  add column if not exists awarded_by uuid references public.profiles(id) on delete set null;

alter table public.reading_club_chapters
  drop constraint if exists reading_club_chapters_end_page_check;
alter table public.reading_club_chapters
  add constraint reading_club_chapters_end_page_check
  check (end_page is null or end_page >= 1);

create index if not exists reading_club_chapters_page_idx
  on public.reading_club_chapters (club_id, end_page)
  where end_page is not null;

-- Capítulo máximo abierto por el plan del club. Si el plan está desactivado,
-- todos los capítulos quedan disponibles y solo limita el progreso personal.
create or replace function public.reading_club_unlocked_chapter(
  p_club_id bigint,
  p_at timestamptz default now()
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_base integer := 1;
  v_next timestamptz;
  v_interval integer := 7;
  v_per_period integer := 1;
  v_total integer := 1;
  v_periods integer := 0;
begin
  select
    c.reading_plan_enabled,
    greatest(1, c.reading_plan_unlocked_chapter),
    c.reading_plan_next_unlock_at,
    greatest(1, c.reading_plan_interval_days),
    greatest(1, c.reading_plan_chapters_per_period)
  into v_enabled, v_base, v_next, v_interval, v_per_period
  from public.reading_clubs c
  where c.id = p_club_id;

  if not found then
    return 1;
  end if;

  select greatest(1, count(*)::integer)
  into v_total
  from public.reading_club_chapters ch
  where ch.club_id = p_club_id;

  if not v_enabled then
    return v_total;
  end if;

  if v_next is not null and p_at >= v_next then
    v_periods := floor(
      extract(epoch from (p_at - v_next)) /
      (greatest(1, v_interval)::numeric * 86400)
    )::integer + 1;
  end if;

  return least(v_total, greatest(1, v_base + (v_periods * v_per_period)));
end;
$$;

create or replace function public.reading_club_can_access_chapter(
  p_club_id bigint,
  p_chapter integer,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_current integer := 1;
  v_unlocked integer := 1;
begin
  if p_user_id is null or p_chapter is null then return false; end if;

  select m.role, greatest(1, m.current_chapter)
  into v_role, v_current
  from public.reading_club_members m
  where m.club_id = p_club_id
    and m.user_id = p_user_id
    and m.status = 'active';

  if not found then return false; end if;
  if v_role in ('owner', 'moderator') then return true; end if;

  v_unlocked := public.reading_club_unlocked_chapter(p_club_id, now());
  return p_chapter <= least(v_current, v_unlocked);
end;
$$;

-- Sustituye el mapa de capítulos en una única operación atómica.
create or replace function public.replace_reading_club_chapters(
  p_club_id bigint,
  p_chapters jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_title text;
  v_end_page integer;
  v_previous_page integer := 0;
  v_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if not public.is_reading_club_admin(p_club_id, auth.uid()) then
    raise exception 'No tienes permisos para editar los capítulos.';
  end if;
  if jsonb_typeof(coalesce(p_chapters, '[]'::jsonb)) <> 'array' then
    raise exception 'La lista de capítulos no es válida.';
  end if;

  delete from public.reading_club_chapters where club_id = p_club_id;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_chapters, '[]'::jsonb)) with ordinality
  loop
    v_count := v_count + 1;
    if v_count > 160 then exit; end if;

    v_title := left(trim(coalesce(v_item.value->>'title', 'Capítulo ' || v_count)), 180);
    if v_title = '' then v_title := 'Capítulo ' || v_count; end if;

    begin
      v_end_page := nullif(trim(coalesce(v_item.value->>'end_page', '')), '')::integer;
    exception when invalid_text_representation then
      raise exception 'La página final del capítulo % no es válida.', v_count;
    end;

    if v_end_page is not null then
      if v_end_page < 1 or v_end_page <= v_previous_page then
        raise exception 'Las páginas finales deben crecer de un capítulo al siguiente.';
      end if;
      v_previous_page := v_end_page;
    end if;

    insert into public.reading_club_chapters
      (club_id, chapter_number, title, end_page, created_by)
    values
      (p_club_id, v_count, v_title, v_end_page, auth.uid());
  end loop;

  if v_count = 0 then raise exception 'Añade al menos un capítulo.'; end if;
  return true;
end;
$$;

-- Creadora y moderadoras gestionan ritmo, sesiones y capítulos abiertos.
create or replace function public.update_reading_club_plan(
  p_club_id bigint,
  p_enabled boolean,
  p_unlocked_chapter integer,
  p_next_unlock_at timestamptz,
  p_interval_days integer,
  p_chapters_per_period integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  if not public.is_reading_club_admin(p_club_id, auth.uid()) then
    raise exception 'No tienes permisos para gestionar el plan de lectura.';
  end if;

  update public.reading_clubs
  set reading_plan_enabled = coalesce(p_enabled, false),
      reading_plan_unlocked_chapter = greatest(1, coalesce(p_unlocked_chapter, 1)),
      reading_plan_next_unlock_at = p_next_unlock_at,
      reading_plan_interval_days = greatest(1, least(365, coalesce(p_interval_days, 7))),
      reading_plan_chapters_per_period = greatest(1, least(50, coalesce(p_chapters_per_period, 1))),
      updated_at = now()
  where id = p_club_id;

  if not found then raise exception 'El club no existe.'; end if;
  return true;
end;
$$;

-- Los ajustes sensibles quedan reservados a la creadora. Las moderadoras
-- sí pueden cambiar imágenes y normas, tal como se acordó.
create or replace function public.update_reading_club_settings(
  p_club_id bigint,
  p_name text,
  p_description text,
  p_visibility text,
  p_banner_url text,
  p_icon_url text,
  p_rules text[]
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;

  select m.role into v_role
  from public.reading_club_members m
  where m.club_id = p_club_id
    and m.user_id = auth.uid()
    and m.status = 'active';

  if v_role not in ('owner', 'moderator') then
    raise exception 'No tienes permisos para editar este club.';
  end if;

  update public.reading_clubs c
  set name = case
        when v_role = 'owner' then left(trim(coalesce(p_name, c.name)), 80)
        else c.name
      end,
      description = case
        when v_role = 'owner' then trim(coalesce(p_description, c.description))
        else c.description
      end,
      visibility = case
        when v_role = 'owner' and p_visibility = 'private' then 'private'
        when v_role = 'owner' then 'public'
        else c.visibility
      end,
      banner_url = trim(coalesce(p_banner_url, c.banner_url)),
      icon_url = trim(coalesce(p_icon_url, c.icon_url)),
      rules = array(
        select left(trim(item.rule), 240)
        from unnest(coalesce(p_rules, array[]::text[])) as item(rule)
        where trim(item.rule) <> ''
        limit 12
      ),
      updated_at = now()
  where c.id = p_club_id;

  if not found then raise exception 'El club no existe.'; end if;
  return true;
end;
$$;

-- Guarda progreso del club, lo enlaza con Mi biblioteca/Inicio y calcula el
-- capítulo automáticamente cuando existen páginas finales configuradas.
create or replace function public.update_reading_club_progress(
  p_club_id bigint,
  p_current_chapter integer,
  p_current_page integer,
  p_progress integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_book_id text;
  v_total_pages integer := 0;
  v_safe_page integer := 0;
  v_safe_progress integer := 0;
  v_safe_chapter integer := 1;
  v_has_page_map boolean := false;
  v_legacy_id bigint;
  v_previous_progress integer := 0;
  v_previous_page integer := 0;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;

  select c.current_book_id, greatest(0, coalesce(b.pages, 0))
  into v_book_id, v_total_pages
  from public.reading_clubs c
  left join public.books b on b.id = c.current_book_id
  where c.id = p_club_id;

  if v_book_id is null then raise exception 'El club no tiene un libro activo.'; end if;

  v_safe_page := greatest(0, coalesce(p_current_page, 0));
  if v_total_pages > 0 then
    v_safe_page := least(v_safe_page, v_total_pages);
    v_safe_progress := round((v_safe_page::numeric / v_total_pages::numeric) * 100)::integer;
  else
    v_safe_progress := greatest(0, least(100, coalesce(p_progress, 0)));
  end if;

  select exists(
    select 1 from public.reading_club_chapters ch
    where ch.club_id = p_club_id and ch.end_page is not null
  ) into v_has_page_map;

  if v_has_page_map then
    select coalesce(
      (
        select min(ch.chapter_number)
        from public.reading_club_chapters ch
        where ch.club_id = p_club_id
          and ch.end_page is not null
          and ch.end_page >= v_safe_page
      ),
      (
        select max(ch.chapter_number)
        from public.reading_club_chapters ch
        where ch.club_id = p_club_id
          and ch.end_page is not null
      ),
      1
    ) into v_safe_chapter;
  else
    v_safe_chapter := greatest(1, coalesce(p_current_chapter, 1));
  end if;

  update public.reading_club_members
  set current_chapter = v_safe_chapter,
      current_page = v_safe_page,
      progress = v_safe_progress,
      updated_at = now()
  where club_id = p_club_id
    and user_id = auth.uid()
    and status = 'active';

  if not found then raise exception 'No perteneces a este club.'; end if;

  select p.legacy_id into v_legacy_id
  from public.profiles p
  where p.id = auth.uid();

  if v_legacy_id is not null then
    select coalesce(ub.progress, 0)
    into v_previous_progress
    from public.user_books ub
    where ub.legacy_user_id = v_legacy_id and ub.book_id = v_book_id;

    v_previous_progress := coalesce(v_previous_progress, 0);
    v_previous_page := case
      when v_total_pages > 0 then round((v_total_pages::numeric * v_previous_progress) / 100)::integer
      else 0
    end;

    insert into public.user_books (
      legacy_user_id, book_id, status, progress, started_at, finished_at,
      read_count, paused_at, dropped_at
    ) values (
      v_legacy_id,
      v_book_id,
      case when v_safe_progress >= 100 then 'completed' else 'reading' end,
      v_safe_progress,
      current_date,
      case when v_safe_progress >= 100 then current_date else null end,
      case when v_safe_progress >= 100 then 1 else 0 end,
      null,
      null
    )
    on conflict (legacy_user_id, book_id) do update
    set status = case
          when excluded.progress >= 100 then 'completed'
          when public.user_books.status = 'rereading' then 'rereading'
          else 'reading'
        end,
        progress = excluded.progress,
        started_at = coalesce(public.user_books.started_at, current_date),
        finished_at = case when excluded.progress >= 100 then current_date else null end,
        read_count = case
          when excluded.progress >= 100 and public.user_books.status <> 'completed'
            then greatest(1, public.user_books.read_count)
          else public.user_books.read_count
        end,
        paused_at = null,
        dropped_at = null;

    if v_previous_progress is distinct from v_safe_progress
       and to_regclass('public.reading_progress_log') is not null then
      execute $log$
        insert into public.reading_progress_log
          (legacy_user_id, book_id, previous_progress, new_progress, pages_delta, note, spoiler)
        values ($1, $2, $3, $4, $5, null, false)
      $log$
      using
        v_legacy_id,
        v_book_id,
        v_previous_progress,
        v_safe_progress,
        greatest(0, v_safe_page - v_previous_page);
    end if;
  end if;

  return true;
end;
$$;

-- Cualquier avance guardado desde Inicio o Mi biblioteca se refleja en todos
-- los clubes que estén leyendo ese mismo libro.
create or replace function public.sync_user_book_progress_to_reading_clubs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_total_pages integer := 0;
  v_page integer := 0;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.legacy_id = new.legacy_user_id;

  if v_profile_id is null then return new; end if;

  select greatest(0, coalesce(b.pages, 0)) into v_total_pages
  from public.books b where b.id = new.book_id;

  if v_total_pages > 0 then
    v_page := round((v_total_pages::numeric * greatest(0, least(100, coalesce(new.progress, 0)))) / 100)::integer;
  end if;

  update public.reading_club_members m
  set progress = greatest(0, least(100, coalesce(new.progress, 0))),
      current_page = case when v_total_pages > 0 then v_page else m.current_page end,
      current_chapter = case
        when exists (
          select 1 from public.reading_club_chapters mapped
          where mapped.club_id = m.club_id and mapped.end_page is not null
        ) then coalesce(
          (
            select min(mapped.chapter_number)
            from public.reading_club_chapters mapped
            where mapped.club_id = m.club_id
              and mapped.end_page is not null
              and mapped.end_page >= v_page
          ),
          (
            select max(mapped.chapter_number)
            from public.reading_club_chapters mapped
            where mapped.club_id = m.club_id and mapped.end_page is not null
          ),
          m.current_chapter
        )
        else m.current_chapter
      end,
      updated_at = now()
  from public.reading_clubs c
  where m.club_id = c.id
    and m.user_id = v_profile_id
    and m.status = 'active'
    and c.current_book_id = new.book_id;

  return new;
end;
$$;

drop trigger if exists user_books_sync_reading_clubs on public.user_books;
create trigger user_books_sync_reading_clubs
after insert or update of progress, status on public.user_books
for each row execute function public.sync_user_book_progress_to_reading_clubs();

-- Las actualizaciones directas del club quedan reservadas a la creadora.
-- Las moderadoras usan las funciones seguras que solo cambian campos permitidos.
drop policy if exists reading_clubs_update on public.reading_clubs;
create policy reading_clubs_update
on public.reading_clubs for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- Protege conversaciones de capítulos aún no disponibles.
drop policy if exists reading_club_posts_select on public.reading_club_posts;
create policy reading_club_posts_select
on public.reading_club_posts for select
to authenticated
using (
  public.is_reading_club_member(club_id, auth.uid())
  and (
    channel = 'general'
    or public.is_reading_club_admin(club_id, auth.uid())
    or public.reading_club_can_access_chapter(club_id, chapter_number, auth.uid())
  )
);

drop policy if exists reading_club_posts_insert on public.reading_club_posts;
create policy reading_club_posts_insert
on public.reading_club_posts for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_reading_club_member(club_id, auth.uid())
  and (
    channel = 'general'
    or public.is_reading_club_admin(club_id, auth.uid())
    or public.reading_club_can_access_chapter(club_id, chapter_number, auth.uid())
  )
);

create or replace function public.moderate_reading_club_post(
  p_post_id bigint,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id bigint;
begin
  select p.club_id into v_club_id
  from public.reading_club_posts p where p.id = p_post_id;

  if v_club_id is null then raise exception 'El mensaje no existe.'; end if;
  if not public.is_reading_club_admin(v_club_id, auth.uid()) then
    raise exception 'No tienes permisos para moderar este mensaje.';
  end if;

  if p_action = 'delete' then
    delete from public.reading_club_posts where id = p_post_id;
  elsif p_action = 'spoiler' then
    update public.reading_club_posts set contains_spoilers = true, updated_at = now() where id = p_post_id;
  elsif p_action = 'safe' then
    update public.reading_club_posts set contains_spoilers = false, updated_at = now() where id = p_post_id;
  else
    raise exception 'La acción de moderación no es válida.';
  end if;

  return true;
end;
$$;

create or replace function public.award_reading_club_bookmark(
  p_club_id bigint,
  p_user_id uuid,
  p_label text,
  p_description text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_label text := left(trim(coalesce(p_label, '')), 80);
begin
  if not public.is_reading_club_admin(p_club_id, auth.uid()) then
    raise exception 'No tienes permisos para conceder marcapáginas.';
  end if;
  if v_label = '' then raise exception 'Escribe un nombre para el marcapáginas.'; end if;
  if not public.is_reading_club_member(p_club_id, p_user_id) then
    raise exception 'La persona no pertenece al club.';
  end if;

  insert into public.reading_club_member_achievements
    (club_id, user_id, badge_key, label, description, awarded_by)
  values
    (p_club_id, p_user_id, 'custom-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
     v_label, left(trim(coalesce(p_description, '')), 240), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_reading_club_bookmark(p_achievement_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id bigint;
begin
  select a.club_id into v_club_id
  from public.reading_club_member_achievements a
  where a.id = p_achievement_id;

  if v_club_id is null then raise exception 'El marcapáginas no existe.'; end if;
  if not public.is_reading_club_admin(v_club_id, auth.uid()) then
    raise exception 'No tienes permisos para retirar este marcapáginas.';
  end if;

  delete from public.reading_club_member_achievements where id = p_achievement_id;
  return true;
end;
$$;

grant execute on function public.reading_club_unlocked_chapter(bigint, timestamptz) to authenticated;
grant execute on function public.reading_club_can_access_chapter(bigint, integer, uuid) to authenticated;
grant execute on function public.replace_reading_club_chapters(bigint, jsonb) to authenticated;
grant execute on function public.update_reading_club_plan(bigint, boolean, integer, timestamptz, integer, integer) to authenticated;
grant execute on function public.update_reading_club_progress(bigint, integer, integer, integer) to authenticated;
grant execute on function public.moderate_reading_club_post(bigint, text) to authenticated;
grant execute on function public.award_reading_club_bookmark(bigint, uuid, text, text) to authenticated;
grant execute on function public.revoke_reading_club_bookmark(bigint) to authenticated;

commit;

select
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reading_clubs'
      and column_name = 'reading_plan_next_unlock_at'
  ) as plan_lectura,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reading_club_chapters'
      and column_name = 'end_page'
  ) as paginas_por_capitulo,
  to_regprocedure('public.reading_club_unlocked_chapter(bigint,timestamp with time zone)') is not null as desbloqueo_automatico,
  to_regprocedure('public.moderate_reading_club_post(bigint,text)') is not null as moderacion_mensajes,
  to_regprocedure('public.award_reading_club_bookmark(bigint,uuid,text,text)') is not null as marcapaginas_gestionables,
  to_regclass('public.user_books') is not null as progreso_sincronizado;
