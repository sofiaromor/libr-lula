-- Registro publico seguro para Librélula.
-- Crea un perfil normal cuando Supabase Auth crea un usuario nuevo.
-- También impide que una cuenta normal se convierta en admin desde el cliente.

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
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    'lectora'
  );

  clean_username := lower(base_username);
  clean_username := regexp_replace(clean_username, '[^a-z0-9_]+', '-', 'g');
  clean_username := trim(both '-' from clean_username);

  if clean_username = '' then
    clean_username := 'lectora';
  end if;

  final_username := left(clean_username, 30);

  if exists (
    select 1
    from public.profiles
    where username = final_username
  ) then
    final_username := left(clean_username, 23) || '-' || left(new.id::text, 6);
  end if;

  insert into public.profiles (
    id,
    username,
    avatar,
    bio,
    is_admin
  )
  values (
    new.id,
    final_username,
    '',
    '',
    false
  )
  on conflict (id) do nothing;

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