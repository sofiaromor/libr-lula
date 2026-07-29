-- Librélula · paginación real del catálogo
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Es idempotente: puede volver a ejecutarse sin duplicar datos.

begin;

create or replace function public.librelula_catalog_genres(p_value text)
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  select coalesce(array_agg(distinct clean_genre order by clean_genre), array[]::text[])
  from (
    select nullif(btrim(part, ' "'), '') as clean_genre
    from regexp_split_to_table(
      btrim(coalesce(p_value, ''), '[]'),
      E'\\s*,\\s*|\\s*\\|\\s*'
    ) as pieces(part)
  ) genres
  where clean_genre is not null;
$$;

create or replace function public.catalog_books_page(
  p_page integer default 1,
  p_page_size integer default 24,
  p_search text default null,
  p_genres text[] default array[]::text[],
  p_genre_mode text default 'any',
  p_year text default null,
  p_book_id text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with enriched as (
    select
      b.id,
      b.title,
      b.author,
      b.synopsis,
      b.cover,
      b.genre,
      b.year,
      b.pages,
      b.publisher,
      b.language,
      b.isbn,
      b.saga_name,
      b.saga_number,
      b.saga_key,
      b.hero_color,
      b.pdf_file,
      b.epub_file,
      b.review_status,
      b.created_at,
      coalesce((
        select array_agg(bt.value order by bt.position, bt.value)
        from public.book_taxonomy bt
        where bt.book_id = b.id and bt.kind = 'theme'
      ), array[]::text[]) as themes,
      coalesce((
        select array_agg(bt.value order by bt.position, bt.value)
        from public.book_taxonomy bt
        where bt.book_id = b.id and bt.kind = 'aesthetic'
      ), array[]::text[]) as aesthetics,
      coalesce((
        select array_agg(bt.value order by bt.position, bt.value)
        from public.book_taxonomy bt
        where bt.book_id = b.id and bt.kind = 'audience'
      ), array[]::text[]) as audiences
    from public.books b
    where b.review_status = 'approved'
      and (nullif(btrim(p_book_id), '') is null or b.id = btrim(p_book_id))
  ),
  filtered as (
    select e.*
    from enriched e
    where
      (
        nullif(btrim(p_search), '') is null
        or concat_ws(
          ' ',
          e.title,
          e.author,
          e.publisher,
          e.isbn,
          e.saga_name,
          e.genre,
          array_to_string(e.themes, ' '),
          array_to_string(e.aesthetics, ' '),
          array_to_string(e.audiences, ' ')
        ) ilike '%' || btrim(p_search) || '%'
      )
      and (nullif(btrim(p_year), '') is null or e.year = btrim(p_year))
      and (
        coalesce(cardinality(p_genres), 0) = 0
        or (
          lower(coalesce(p_genre_mode, 'any')) = 'all'
          and not exists (
            select 1
            from unnest(p_genres) wanted(genre)
            where not exists (
              select 1
              from unnest(public.librelula_catalog_genres(e.genre)) actual(genre)
              where lower(actual.genre) = lower(btrim(wanted.genre))
            )
          )
        )
        or (
          lower(coalesce(p_genre_mode, 'any')) <> 'all'
          and exists (
            select 1
            from unnest(p_genres) wanted(genre)
            where exists (
              select 1
              from unnest(public.librelula_catalog_genres(e.genre)) actual(genre)
              where lower(actual.genre) = lower(btrim(wanted.genre))
            )
          )
        )
      )
  ),
  paged as (
    select f.*
    from filtered f
    order by
      case when f.year ~ '^[0-9]{4}$' then f.year::integer else 0 end desc,
      lower(f.title) asc,
      lower(f.author) asc,
      f.id asc
    offset (
      (greatest(coalesce(p_page, 1), 1) - 1)
      * least(greatest(coalesce(p_page_size, 24), 1), 60)
    )
    limit least(greatest(coalesce(p_page_size, 24), 1), 60)
  )
  select jsonb_build_object(
    'books', coalesce(
      (
        select jsonb_agg(
          to_jsonb(paged_row)
          order by
            case when paged_row.year ~ '^[0-9]{4}$' then paged_row.year::integer else 0 end desc,
            lower(paged_row.title) asc,
            lower(paged_row.author) asc,
            paged_row.id asc
        )
        from paged paged_row
      ),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered)
  );
$$;

create or replace function public.catalog_filter_options()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'years', coalesce(
      (
        select jsonb_agg(year_value order by year_value::integer desc)
        from (
          select distinct b.year as year_value
          from public.books b
          where b.review_status = 'approved'
            and b.year ~ '^[0-9]{4}$'
        ) years
      ),
      '[]'::jsonb
    ),
    'genre_counts', coalesce(
      (
        select jsonb_object_agg(genre_name, genre_total order by genre_name)
        from (
          select genre_name, count(*)::integer as genre_total
          from public.books b
          cross join lateral unnest(public.librelula_catalog_genres(b.genre)) as genres(genre_name)
          where b.review_status = 'approved'
          group by genre_name
        ) genre_totals
      ),
      '{}'::jsonb
    )
  );
$$;

create index if not exists books_catalog_status_year_title_idx
  on public.books (review_status, year desc, title asc);

create index if not exists book_taxonomy_catalog_book_kind_idx
  on public.book_taxonomy (book_id, kind, position);

grant execute on function public.librelula_catalog_genres(text) to anon, authenticated;
grant execute on function public.catalog_books_page(integer, integer, text, text[], text, text, text) to anon, authenticated;
grant execute on function public.catalog_filter_options() to anon, authenticated;

commit;

-- Comprobación final. Debe devolver un objeto con "books" y "total".
select public.catalog_books_page(1, 24, null, array[]::text[], 'any', null, null) as pagina_1;
