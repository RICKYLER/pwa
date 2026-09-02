-- Split monolithic name columns into first / middle / last name parts
--
-- Both public.users.name and public.residents.full_name stored a single
-- display string. Registration forms now collect First name, Middle name,
-- and Last name separately, so this migration:
--
--   1. Adds first_name / middle_name / last_name columns to both tables.
--   2. Backfills the new columns by splitting the existing display names
--      (trailing Jr/Sr/II/III/IV/V suffixes stay attached to the surname).
--   3. Adds BEFORE INSERT/UPDATE triggers that keep the display column and
--      the parts in sync in both directions:
--        - writes that set the parts recompute the display name, and
--        - legacy writes that only set the display name re-split the parts.
--      Existing code paths that still write users.name or
--      residents.full_name keep working unchanged.
--   4. Updates handle_new_auth_user so new auth.users rows created with
--      first/middle/last metadata store the parts directly.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.join_name_parts(p_first text, p_middle text, p_last text)
returns text
language sql
immutable
as $$
  select btrim(concat_ws(
    ' ',
    nullif(btrim(coalesce(p_first, '')), ''),
    nullif(btrim(coalesce(p_middle, '')), ''),
    nullif(btrim(coalesce(p_last, '')), '')
  ))
$$;

create or replace function public.split_full_name(p_full_name text)
returns table (first_name text, middle_name text, last_name text)
language plpgsql
immutable
as $$
declare
  tokens text[];
  suffix text := '';
  token_count int;
begin
  tokens := array(
    select t
    from unnest(string_to_array(btrim(coalesce(p_full_name, '')), ' ')) as t
    where btrim(t) <> ''
  );
  token_count := coalesce(array_length(tokens, 1), 0);

  -- Keep common name suffixes with the surname.
  if token_count > 1 and lower(tokens[token_count]) ~ '^(jr\.?|sr\.?|ii|iii|iv|v)$' then
    suffix := tokens[token_count];
    token_count := token_count - 1;
  end if;

  if token_count <= 0 then
    first_name := '';
    middle_name := '';
    last_name := '';
  elsif token_count = 1 then
    first_name := tokens[1];
    middle_name := '';
    last_name := suffix;
  elsif token_count = 2 then
    first_name := tokens[1];
    middle_name := '';
    last_name := concat_ws(' ', tokens[2], suffix);
  else
    first_name := tokens[1];
    middle_name := array_to_string(tokens[2:token_count - 1], ' ');
    last_name := concat_ws(' ', tokens[token_count], suffix);
  end if;

  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- residents.full_name
-- ---------------------------------------------------------------------------

alter table public.residents
  add column if not exists first_name text not null default '',
  add column if not exists middle_name text not null default '',
  add column if not exists last_name text not null default '';

update public.residents r
set
  first_name = (select parts.first_name from public.split_full_name(r.full_name) as parts),
  middle_name = (select parts.middle_name from public.split_full_name(r.full_name) as parts),
  last_name = (select parts.last_name from public.split_full_name(r.full_name) as parts);

create or replace function public.residents_sync_name_parts()
returns trigger
language plpgsql
as $$
declare
  parts_changed boolean;
begin
  if TG_OP = 'INSERT' then
    parts_changed := nullif(btrim(new.first_name), '') is not null
      or nullif(btrim(new.middle_name), '') is not null
      or nullif(btrim(new.last_name), '') is not null;
  else
    parts_changed := new.first_name is distinct from old.first_name
      or new.middle_name is distinct from old.middle_name
      or new.last_name is distinct from old.last_name;
  end if;

  if parts_changed then
    new.first_name := btrim(new.first_name);
    new.middle_name := btrim(new.middle_name);
    new.last_name := btrim(new.last_name);
    new.full_name := public.join_name_parts(new.first_name, new.middle_name, new.last_name);
  elsif TG_OP = 'INSERT' or new.full_name is distinct from old.full_name then
    select parts.first_name, parts.middle_name, parts.last_name
      into new.first_name, new.middle_name, new.last_name
      from public.split_full_name(new.full_name) as parts;
    new.full_name := public.join_name_parts(new.first_name, new.middle_name, new.last_name);
  end if;

  return new;
end;
$$;

drop trigger if exists residents_sync_name_parts_trigger on public.residents;
create trigger residents_sync_name_parts_trigger
before insert or update of full_name, first_name, middle_name, last_name on public.residents
for each row
execute function public.residents_sync_name_parts();

-- ---------------------------------------------------------------------------
-- users.name
-- ---------------------------------------------------------------------------

alter table public.users
  add column if not exists first_name text not null default '',
  add column if not exists middle_name text not null default '',
  add column if not exists last_name text not null default '';

update public.users u
set
  first_name = (select parts.first_name from public.split_full_name(u.name) as parts),
  middle_name = (select parts.middle_name from public.split_full_name(u.name) as parts),
  last_name = (select parts.last_name from public.split_full_name(u.name) as parts);

create or replace function public.users_sync_name_parts()
returns trigger
language plpgsql
as $$
declare
  parts_changed boolean;
begin
  if TG_OP = 'INSERT' then
    parts_changed := nullif(btrim(new.first_name), '') is not null
      or nullif(btrim(new.middle_name), '') is not null
      or nullif(btrim(new.last_name), '') is not null;
  else
    parts_changed := new.first_name is distinct from old.first_name
      or new.middle_name is distinct from old.middle_name
      or new.last_name is distinct from old.last_name;
  end if;

  if parts_changed then
    new.first_name := btrim(new.first_name);
    new.middle_name := btrim(new.middle_name);
    new.last_name := btrim(new.last_name);
    new.name := public.join_name_parts(new.first_name, new.middle_name, new.last_name);
  elsif TG_OP = 'INSERT' or new.name is distinct from old.name then
    select parts.first_name, parts.middle_name, parts.last_name
      into new.first_name, new.middle_name, new.last_name
      from public.split_full_name(new.name) as parts;
    new.name := public.join_name_parts(new.first_name, new.middle_name, new.last_name);
  end if;

  return new;
end;
$$;

drop trigger if exists users_sync_name_parts_trigger on public.users;
create trigger users_sync_name_parts_trigger
before insert or update of name, first_name, middle_name, last_name on public.users
for each row
execute function public.users_sync_name_parts();

-- ---------------------------------------------------------------------------
-- handle_new_auth_user: persist name parts from signup metadata
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_first_name text;
  v_middle_name text;
  v_last_name text;
  v_barangay_id text;
begin
  v_role := case
    when coalesce(new.raw_user_meta_data ->> 'role', '') in ('admin', 'encoder', 'health_worker', 'responder', 'resident')
      then new.raw_user_meta_data ->> 'role'
    else 'resident'
  end;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_middle_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'middle_name', '')), '');
  v_last_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');

  if v_first_name is null and v_middle_name is null and v_last_name is null then
    select parts.first_name, parts.middle_name, parts.last_name
      into v_first_name, v_middle_name, v_last_name
      from public.split_full_name(v_name) as parts;
  end if;

  v_barangay_id := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'barangay_id'), ''),
    'anitapan'
  );

  insert into public.users (
    id,
    email,
    name,
    first_name,
    middle_name,
    last_name,
    role,
    barangay_id,
    must_change_password,
    email_verification_required,
    email_verified_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    v_name,
    coalesce(v_first_name, ''),
    coalesce(v_middle_name, ''),
    coalesce(v_last_name, ''),
    v_role,
    v_barangay_id,
    false,
    new.email_confirmed_at is null,
    new.email_confirmed_at
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    email_verification_required = excluded.email_verification_required,
    email_verified_at = excluded.email_verified_at,
    updated_at = timezone('utc', now());

  return new;
end;
$$;
