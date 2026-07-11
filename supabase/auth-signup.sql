-- Registro público seguro para Librélula.
-- Crea legacy_users + profiles cuando Supabase Auth crea un usuario nuevo.
-- Mantiene a los usuarios registrados como lectoras normales, no admins.

alter table public.profiles
add column if not exists updated_at timestamptz not null default now();

create sequence if not exists public.legacy_users_legacy_id_seq;

select setval(
  'public.legacy_users_legacy_id_seq',
  greatest(coalesce((select max(legacy_id) from public.legacy_users), 0) + 1, 1),
  false
);

alter table public.legacy_users
alter column legacy_id set default nextval('public.legacy_users_legacy_id_seq'::regclass);


create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  clean_username text;
  final_username text;
  safe_email text;
  new_legacy_id bigint;
begin
  safe_email := coalesce(nullif(new.email, ''), new.id::text || '@auth.local');

  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(split_part(safe_email, '@', 1), ''),
    'lectora'
  );

  clean_username := lower(base_username);
  clean_username := regexp_replace(clean_username, '[^a-z0-9_]+', '-', 'g');
  clean_username := trim(both '-' from clean_username);

  if clean_username = '' then
    clean_username := 'lectora';
  end if;

  final_username := left(clean_username, 30);

  insert into public.legacy_users (
    username,
    email,
    avatar,
    bio,
    is_admin
  )
  values (
    final_username,
    safe_email,
    '',
    '',
    false
  )
  on conflict (email) do update
  set
    username = excluded.username,
    avatar = coalesce(public.legacy_users.avatar, excluded.avatar),
    bio = coalesce(public.legacy_users.bio, excluded.bio),
    is_admin = false
  returning legacy_id into new_legacy_id;

  insert into public.profiles (
    id,
    legacy_id,
    username,
    avatar,
    bio,
    is_admin
  )
  values (
    new.id,
    new_legacy_id,
    final_username,
    '',
    '',
    false
  )
  on conflict (id) do update
  set
    legacy_id = coalesce(public.profiles.legacy_id, excluded.legacy_id),
    username = coalesce(public.profiles.username, excluded.username),
    avatar = coalesce(public.profiles.avatar, excluded.avatar),
    bio = coalesce(public.profiles.bio, excluded.bio);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();


create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) = true and not public.current_user_is_admin() then
      new.is_admin := false;
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(new.is_admin, false) is distinct from coalesce(old.is_admin, false)
      and not public.current_user_is_admin()
    then
      raise exception 'No puedes cambiar permisos de administración.';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_fields on public.profiles;

create trigger profiles_protect_admin_fields
before insert or update on public.profiles
for each row
execute function public.protect_profile_admin_fields();


-- Reparar perfiles ya creados con legacy_id nulo.

insert into public.legacy_users (
  username,
  email,
  avatar,
  bio,
  is_admin
)
select
  coalesce(nullif(trim(p.username), ''), split_part(u.email, '@', 1), 'lectora') as username,
  coalesce(nullif(u.email, ''), u.id::text || '@auth.local') as email,
  coalesce(p.avatar, ''),
  coalesce(p.bio, ''),
  false
from public.profiles p
join auth.users u on u.id = p.id
where p.legacy_id is null
on conflict (email) do update
set
  username = excluded.username,
  avatar = coalesce(public.legacy_users.avatar, excluded.avatar),
  bio = coalesce(public.legacy_users.bio, excluded.bio),
  is_admin = false;

update public.profiles p
set legacy_id = lu.legacy_id
from auth.users u
join public.legacy_users lu
  on lu.email = coalesce(nullif(u.email, ''), u.id::text || '@auth.local')
where p.id = u.id
  and p.legacy_id is null;