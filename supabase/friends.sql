-- Sistema social básico de Librélula.
-- Código Librélula + seguir = añadir amigo.

alter table public.profiles
add column if not exists display_name text;

alter table public.profiles
add column if not exists friend_code text;


create or replace function public.generate_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    candidate text;
    index_value integer;
begin
    loop
    candidate := 'LBR-';

    for index_value in 1..4 loop
        candidate := candidate || substr(
        alphabet,
        floor(random() * length(alphabet) + 1)::integer,
        1
        );
    end loop;

    candidate := candidate || '-';

    for index_value in 1..4 loop
        candidate := candidate || substr(
        alphabet,
        floor(random() * length(alphabet) + 1)::integer,
        1
        );
    end loop;

    exit when not exists (
        select 1
        from public.profiles
        where friend_code = candidate
    );
    end loop;

    return candidate;
end;
$$;


create or replace function public.prepare_profile_social_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.display_name is null or trim(new.display_name) = '' then
    new.display_name := coalesce(nullif(trim(new.username), ''), 'lectora');
    end if;

    if new.friend_code is null or trim(new.friend_code) = '' then
    new.friend_code := public.generate_friend_code();
    end if;

    return new;
end;
$$;

drop trigger if exists profiles_prepare_social_fields on public.profiles;

create trigger profiles_prepare_social_fields
before insert on public.profiles
for each row
execute function public.prepare_profile_social_fields();


update public.profiles
set display_name = coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), 'lectora')
where display_name is null
    or trim(display_name) = '';

update public.profiles
set friend_code = public.generate_friend_code()
where friend_code is null
    or trim(friend_code) = '';

create unique index if not exists profiles_friend_code_key
on public.profiles(friend_code);


create table if not exists public.user_follows (
    follower_id uuid not null references public.profiles(id) on delete cascade,
    following_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (follower_id, following_id),
    constraint user_follows_no_self_follow check (follower_id <> following_id)
);

alter table public.user_follows enable row level security;


do $$
begin
    if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
        and tablename = 'user_follows'
        and policyname = 'user_follows_select_related'
    ) then
    create policy user_follows_select_related
    on public.user_follows
    for select
    to authenticated
    using (
        auth.uid() = follower_id
        or auth.uid() = following_id
    );
    end if;

    if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
        and tablename = 'user_follows'
        and policyname = 'user_follows_insert_own'
    ) then
    create policy user_follows_insert_own
    on public.user_follows
    for insert
    to authenticated
    with check (auth.uid() = follower_id);
    end if;

    if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
        and tablename = 'user_follows'
        and policyname = 'user_follows_delete_own'
    ) then
    create policy user_follows_delete_own
    on public.user_follows
    for delete
    to authenticated
    using (auth.uid() = follower_id);
    end if;
end;
$$;