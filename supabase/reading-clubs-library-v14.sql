-- Librélula · Clubes V14
-- Estantería visual, cierre sin siguiente libro y detalle de reseñas del club.
-- Requiere V12 y V13. No borra historial, reseñas ni mensajes.

begin;

-- La estantería sigue leyendo las reseñas en vivo desde user_books, pero ahora
-- devuelve una fila por PARTICIPANTE dentro de reviews, tenga o no reseña.
create or replace function public.reading_club_bookshelf(p_club_id bigint)
returns table (
  reading_id bigint,
  reading_status text,
  book_id text,
  book_title text,
  book_author text,
  book_cover text,
  book_pages integer,
  started_at timestamptz,
  finished_at timestamptz,
  participant_count integer,
  rating_count integer,
  review_count integer,
  avg_rating numeric,
  reviews jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  if not exists (
    select 1
    from public.reading_clubs c
    where c.id = p_club_id
      and (
        c.visibility = 'public'
        or exists (
          select 1
          from public.reading_club_members m
          where m.club_id = c.id
            and m.user_id = auth.uid()
            and m.status = 'active'
        )
      )
  ) then
    raise exception 'No tienes acceso a la estantería de este club.';
  end if;

  return query
  select
    r.id,
    r.status,
    r.book_id,
    b.title,
    b.author,
    b.cover,
    b.pages,
    r.started_at,
    r.finished_at,
    case
      when r.status = 'current' then (
        select count(*)::integer
        from public.reading_club_members cm
        where cm.club_id = r.club_id and cm.status = 'active'
      )
      else (
        select count(*)::integer
        from public.reading_club_reading_members rm
        where rm.reading_id = r.id
      )
    end as participant_count,
    case
      when r.status = 'completed' then (
        select count(*)::integer
        from public.reading_club_reading_members rm
        join public.profiles p on p.id = rm.user_id
        join public.user_books ub
          on ub.legacy_user_id = p.legacy_id
         and ub.book_id = r.book_id
        where rm.reading_id = r.id
          and ub.score between 1 and 5
      )
      else 0
    end as rating_count,
    case
      when r.status = 'completed' then (
        select count(*)::integer
        from public.reading_club_reading_members rm
        join public.profiles p on p.id = rm.user_id
        join public.user_books ub
          on ub.legacy_user_id = p.legacy_id
         and ub.book_id = r.book_id
        where rm.reading_id = r.id
          and trim(coalesce(ub.notes, '')) <> ''
      )
      else 0
    end as review_count,
    case
      when r.status = 'completed' then (
        select round(avg(ub.score)::numeric, 2)
        from public.reading_club_reading_members rm
        join public.profiles p on p.id = rm.user_id
        join public.user_books ub
          on ub.legacy_user_id = p.legacy_id
         and ub.book_id = r.book_id
        where rm.reading_id = r.id
          and ub.score between 1 and 5
      )
      else null
    end as avg_rating,
    case
      when r.status = 'completed' then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'profile_id', p.id,
            'role_at_close', rm.role_at_close,
            'progress_at_close', rm.progress_at_close,
            'current_page_at_close', rm.current_page_at_close,
            'current_chapter_at_close', rm.current_chapter_at_close,
            'score', case when ub.score between 1 and 5 then ub.score else null end,
            'review', trim(coalesce(ub.notes, '')),
            'finished_at', ub.finished_at,
            'updated_at', ub.updated_at
          )
          order by coalesce(ub.updated_at, rm.captured_at) desc
        )
        from public.reading_club_reading_members rm
        join public.profiles p on p.id = rm.user_id
        left join public.user_books ub
          on ub.legacy_user_id = p.legacy_id
         and ub.book_id = r.book_id
        where rm.reading_id = r.id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end as reviews
  from public.reading_club_readings r
  join public.books b on b.id = r.book_id
  where r.club_id = p_club_id
  order by
    case when r.status = 'current' then 0 else 1 end,
    r.finished_at desc nulls first,
    r.started_at desc;
end;
$$;

-- Cierra la lectura actual. El siguiente libro es OPCIONAL.
create or replace function public.finish_reading_club_book(
  p_club_id bigint,
  p_next_book_id text,
  p_next_chapters jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.reading_clubs%rowtype;
  v_current_reading_id bigint;
  v_new_reading_id bigint;
  v_has_next boolean := trim(coalesce(p_next_book_id, '')) <> '';
  v_item record;
  v_count integer := 0;
  v_title text;
  v_end_page integer;
  v_previous_page integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_club
  from public.reading_clubs
  where id = p_club_id
  for update;

  if not found then
    raise exception 'El club no existe.';
  end if;

  if v_club.owner_id is distinct from auth.uid() then
    raise exception 'Solo la creadora puede cerrar una lectura.';
  end if;

  if v_club.current_book_id is null then
    raise exception 'El club no tiene una lectura activa.';
  end if;

  if v_has_next then
    if p_next_book_id = v_club.current_book_id then
      raise exception 'Elige un libro distinto para la siguiente lectura.';
    end if;

    if not exists (select 1 from public.books b where b.id = p_next_book_id) then
      raise exception 'El siguiente libro no existe en el catálogo.';
    end if;

    if jsonb_typeof(coalesce(p_next_chapters, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_next_chapters, '[]'::jsonb)) < 1 then
      raise exception 'Añade al menos un capítulo para la nueva lectura.';
    end if;
  end if;

  v_current_reading_id := v_club.current_reading_id;

  if v_current_reading_id is null then
    select r.id into v_current_reading_id
    from public.reading_club_readings r
    where r.club_id = p_club_id and r.status = 'current'
    limit 1;
  end if;

  if v_current_reading_id is null then
    insert into public.reading_club_readings (club_id, book_id, status, started_at)
    values (p_club_id, v_club.current_book_id, 'current', coalesce(v_club.created_at, now()))
    returning id into v_current_reading_id;
  end if;

  insert into public.reading_club_reading_members (
    reading_id,
    user_id,
    role_at_close,
    progress_at_close,
    current_page_at_close,
    current_chapter_at_close
  )
  select
    v_current_reading_id,
    m.user_id,
    m.role,
    greatest(0, least(100, coalesce(m.progress, 0))),
    greatest(0, coalesce(m.current_page, 0)),
    greatest(1, coalesce(m.current_chapter, 1))
  from public.reading_club_members m
  where m.club_id = p_club_id
    and m.status = 'active'
  on conflict (reading_id, user_id) do update
    set role_at_close = excluded.role_at_close,
        progress_at_close = excluded.progress_at_close,
        current_page_at_close = excluded.current_page_at_close,
        current_chapter_at_close = excluded.current_chapter_at_close,
        captured_at = now();

  update public.reading_club_readings
  set status = 'completed',
      finished_at = now(),
      closed_by = auth.uid(),
      updated_at = now()
  where id = v_current_reading_id;

  -- Al cerrar una lectura siempre limpiamos el estado activo del club.
  update public.reading_clubs
  set current_book_id = null,
      current_reading_id = null,
      reading_plan_enabled = false,
      reading_plan_unlocked_chapter = 1,
      reading_plan_next_unlock_at = null,
      updated_at = now()
  where id = p_club_id;

  update public.reading_club_members
  set current_chapter = 1,
      current_page = 0,
      progress = 0,
      updated_at = now()
  where club_id = p_club_id
    and status = 'active';

  delete from public.reading_club_chapters where club_id = p_club_id;

  if not v_has_next then
    return v_current_reading_id;
  end if;

  insert into public.reading_club_readings (club_id, book_id, status, started_at)
  values (p_club_id, p_next_book_id, 'current', now())
  returning id into v_new_reading_id;

  update public.reading_clubs
  set current_book_id = p_next_book_id,
      current_reading_id = v_new_reading_id,
      updated_at = now()
  where id = p_club_id;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(coalesce(p_next_chapters, '[]'::jsonb)) with ordinality
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

  return v_current_reading_id;
end;
$$;

-- Empieza una lectura después de un periodo "entre lecturas".
create or replace function public.start_reading_club_book(
  p_club_id bigint,
  p_book_id text,
  p_chapters jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.reading_clubs%rowtype;
  v_new_reading_id bigint;
  v_item record;
  v_count integer := 0;
  v_title text;
  v_end_page integer;
  v_previous_page integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select * into v_club
  from public.reading_clubs
  where id = p_club_id
  for update;

  if not found then
    raise exception 'El club no existe.';
  end if;

  if v_club.owner_id is distinct from auth.uid() then
    raise exception 'Solo la creadora puede empezar la nueva lectura.';
  end if;

  if v_club.current_book_id is not null
     or v_club.current_reading_id is not null
     or exists (
       select 1 from public.reading_club_readings r
       where r.club_id = p_club_id and r.status = 'current'
     ) then
    raise exception 'El club ya tiene una lectura activa.';
  end if;

  if trim(coalesce(p_book_id, '')) = ''
     or not exists (select 1 from public.books b where b.id = p_book_id) then
    raise exception 'Elige un libro válido del catálogo.';
  end if;

  if jsonb_typeof(coalesce(p_chapters, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_chapters, '[]'::jsonb)) < 1 then
    raise exception 'Añade al menos un capítulo para la nueva lectura.';
  end if;

  insert into public.reading_club_readings (club_id, book_id, status, started_at)
  values (p_club_id, p_book_id, 'current', now())
  returning id into v_new_reading_id;

  update public.reading_clubs
  set current_book_id = p_book_id,
      current_reading_id = v_new_reading_id,
      reading_plan_enabled = false,
      reading_plan_unlocked_chapter = 1,
      reading_plan_next_unlock_at = null,
      updated_at = now()
  where id = p_club_id;

  update public.reading_club_members
  set current_chapter = 1,
      current_page = 0,
      progress = 0,
      updated_at = now()
  where club_id = p_club_id
    and status = 'active';

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

  return v_new_reading_id;
end;
$$;

revoke execute on function public.reading_club_bookshelf(bigint) from public;
revoke execute on function public.finish_reading_club_book(bigint, text, jsonb) from public;
revoke execute on function public.start_reading_club_book(bigint, text, jsonb) from public;

revoke execute on function public.reading_club_bookshelf(bigint) from anon;
revoke execute on function public.finish_reading_club_book(bigint, text, jsonb) from anon;
revoke execute on function public.start_reading_club_book(bigint, text, jsonb) from anon;

grant execute on function public.reading_club_bookshelf(bigint) to authenticated;
grant execute on function public.finish_reading_club_book(bigint, text, jsonb) to authenticated;
grant execute on function public.start_reading_club_book(bigint, text, jsonb) to authenticated;

commit;

select
  to_regprocedure('public.reading_club_bookshelf(bigint)') is not null as estanteria_actualizada,
  to_regprocedure('public.finish_reading_club_book(bigint,text,jsonb)') is not null as cierre_sin_siguiente_disponible,
  to_regprocedure('public.start_reading_club_book(bigint,text,jsonb)') is not null as inicio_posterior_disponible,
  not has_function_privilege('anon', 'public.finish_reading_club_book(bigint,text,jsonb)', 'EXECUTE') as cierre_bloqueado_para_anon,
  not has_function_privilege('anon', 'public.start_reading_club_book(bigint,text,jsonb)', 'EXECUTE') as inicio_bloqueado_para_anon,
  has_function_privilege('authenticated', 'public.start_reading_club_book(bigint,text,jsonb)', 'EXECUTE') as inicio_disponible_autenticadas;
