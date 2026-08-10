-- Librélula V16 · Moderación de próxima lectura
-- Permite que creadora y moderadoras inicien una nueva lectura cuando el club está entre lecturas.
-- Cerrar/archivar la lectura actual sigue reservado a la creadora.

begin;

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

  if not public.is_reading_club_admin(p_club_id, auth.uid()) then
    raise exception 'Solo la creadora o una moderadora puede empezar la nueva lectura.';
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

revoke execute on function public.start_reading_club_book(bigint, text, jsonb) from public;
revoke execute on function public.start_reading_club_book(bigint, text, jsonb) from anon;
grant execute on function public.start_reading_club_book(bigint, text, jsonb) to authenticated;

commit;

select
  to_regprocedure('public.start_reading_club_book(bigint,text,jsonb)') is not null
    as inicio_disponible,
  position(
    'is_reading_club_admin'
    in pg_get_functiondef('public.start_reading_club_book(bigint,text,jsonb)'::regprocedure)
  ) > 0
    as moderadoras_permitidas,
  not has_function_privilege(
    'anon',
    'public.start_reading_club_book(bigint,text,jsonb)',
    'EXECUTE'
  ) as anon_bloqueado,
  has_function_privilege(
    'authenticated',
    'public.start_reading_club_book(bigint,text,jsonb)',
    'EXECUTE'
  ) as autenticadas_permitidas,
  position(
    'Solo la creadora puede cerrar una lectura.'
    in pg_get_functiondef('public.finish_reading_club_book(bigint,text,jsonb)'::regprocedure)
  ) > 0
    as cierre_sigue_solo_creadora;
