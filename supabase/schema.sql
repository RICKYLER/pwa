-- MSWDO Census PWA - Supabase bootstrap schema
-- Paste this whole file into the Supabase SQL Editor and run it once.

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null default '',
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  role text not null default 'resident'
    check (role in ('admin', 'social_worker', 'solo_parent_focal', 'aics_focal', 'encoder', 'health_worker', 'responder', 'resident')),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  barangay_id text not null default 'anitapan',
  must_change_password boolean not null default false,
  email_verification_required boolean not null default false,
  email_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.status = 'active'
  )
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
    and u.status = 'active'
$$;

create or replace function public.current_user_barangay_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.barangay_id
  from public.users u
  where u.id = auth.uid()
    and u.status = 'active'
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.users u
  where u.id = auth.uid()
    and u.status = 'active'
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
after update of email, email_confirmed_at, raw_user_meta_data on auth.users
for each row
execute function public.handle_new_auth_user();

create or replace function public.handle_user_account_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_household_ids text[];
  v_resident_ids text[];
  v_vulnerability_flag_ids text[];
  v_beneficiary_ids text[];
  v_distribution_record_ids text[];
begin
  v_email := lower(nullif(trim(coalesce(old.email, '')), ''));

  select coalesce(array_agg(h.id), '{}'::text[])
    into v_household_ids
    from public.households h
    where h.applicant_user_id = old.id
       or (v_email is not null and lower(coalesce(h.applicant_email, '')) = v_email);

  select coalesce(array_agg(r.id), '{}'::text[])
    into v_resident_ids
    from public.residents r
    where r.household_id = any(v_household_ids);

  select coalesce(array_agg(vf.id), '{}'::text[])
    into v_vulnerability_flag_ids
    from public.vulnerability_flags vf
    where vf.resident_id = any(v_resident_ids);

  select coalesce(array_agg(b.id), '{}'::text[])
    into v_beneficiary_ids
    from public.beneficiaries b
    where b.resident_id = any(v_resident_ids);

  select coalesce(array_agg(dr.id), '{}'::text[])
    into v_distribution_record_ids
    from public.distribution_records dr
    where dr.household_id = any(v_household_ids)
       or dr.resident_id = any(v_resident_ids);

  -- Remove household/private payloads from audit and sync history too.
  delete from public.audit_logs
  where (entity_type = 'household' and entity_id = any(v_household_ids))
     or (entity_type = 'resident' and entity_id = any(v_resident_ids))
     or (entity_type = 'distribution' and entity_id = any(v_distribution_record_ids))
     or (entity_type = 'user' and entity_id = old.id::text);

  delete from public.sync_backups
  where (entity_type = 'households' and entity_id = any(v_household_ids))
     or (entity_type = 'residents' and entity_id = any(v_resident_ids))
     or (entity_type = 'vulnerability_flags' and entity_id = any(v_vulnerability_flag_ids))
     or (entity_type = 'beneficiaries' and entity_id = any(v_beneficiary_ids))
     or (entity_type = 'distribution_records' and entity_id = any(v_distribution_record_ids));

  -- QR logs and distribution records must be removed before households:
  -- their household/resident foreign keys are SET NULL, which would otherwise
  -- preserve history or violate distribution_records' one-target CHECK.
  delete from public.distribution_qr_scan_logs
  where household_id = any(v_household_ids)
     or claimant_user_id = old.id;

  delete from public.distribution_records
  where id = any(v_distribution_record_ids);

  delete from public.households
  where id = any(v_household_ids);

  -- Clean up user notifications
  delete from public.user_notifications
  where user_id = old.id;

  -- Clean up token tables
  delete from public.password_setup_tokens
  where user_id = old.id;

  delete from public.email_verification_tokens
  where user_id = old.id;

  return old;
end;
$$;

drop trigger if exists on_user_account_deleted on public.users;
create trigger on_user_account_deleted
before delete on public.users
for each row
execute function public.handle_user_account_deleted();

insert into public.users (
  id,
  email,
  name,
  role,
  barangay_id,
  must_change_password,
  email_verification_required,
  email_verified_at
)
select
  au.id,
  coalesce(au.email, ''),
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(au.email, ''), '@', 1)
  ),
  case
    when coalesce(au.raw_user_meta_data ->> 'role', '') in ('admin', 'encoder', 'health_worker', 'responder', 'resident')
      then au.raw_user_meta_data ->> 'role'
    else 'resident'
  end,
  coalesce(nullif(trim(au.raw_user_meta_data ->> 'barangay_id'), ''), 'anitapan'),
  false,
  au.email_confirmed_at is null,
  au.email_confirmed_at
from auth.users au
on conflict (id) do update
set
  email = excluded.email,
  name = excluded.name,
  email_verification_required = excluded.email_verification_required,
  email_verified_at = excluded.email_verified_at,
  updated_at = timezone('utc', now());

create table if not exists public.location_master_lists (
  id text primary key default gen_random_uuid()::text,
  barangay_id text not null,
  municipality text not null,
  barangay_name text not null,
  puroks text[] not null default '{}'::text[],
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.users (id) on delete set null
);

with seeded_barangays (barangay_id, barangay_name) as (
  values
    ('anitapan', 'Anitapan'),
    ('cabuyuan', 'Cabuyuan'),
    ('cadunan', 'Cadunan'),
    ('cuambog', 'Cuambog'),
    ('del-pilar', 'Del Pilar'),
    ('golden-valley', 'Golden Valley'),
    ('libodon', 'Libodon'),
    ('pangibiran', 'Pangibiran'),
    ('pindasan', 'Pindasan'),
    ('san-antonio', 'San Antonio'),
    ('tagnanan', 'Tagnanan')
)
insert into public.location_master_lists (
  id,
  barangay_id,
  municipality,
  barangay_name,
  puroks,
  updated_at,
  updated_by
)
select
  seeded_barangays.barangay_id,
  seeded_barangays.barangay_id,
  'Mabini',
  seeded_barangays.barangay_name,
  '{}'::text[],
  timezone('utc', now()),
  null
from seeded_barangays
where not exists (
  select 1
  from public.location_master_lists existing
  where existing.barangay_id = seeded_barangays.barangay_id
);

create table if not exists public.purok_risk_profiles (
  id text primary key default gen_random_uuid()::text,
  barangay_id text not null,
  purok_sitio text not null,
  flood_prone boolean not null default false,
  flood_control_status text not null default 'unknown'
    check (flood_control_status in ('protected', 'partial', 'none', 'unknown')),
  flood_control_notes text,
  default_evacuation_site text,
  warning_notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.users (id) on delete set null,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

create table if not exists public.evacuation_centers (
  id text primary key,
  municipality text not null default 'Mabini',
  barangay_id text not null,
  name text not null,
  gps_lat double precision,
  gps_lng double precision,
  capacity integer
    check (capacity is null or capacity >= 0),
  status text not null default 'closed'
    check (status in ('closed', 'open')),
  activation_source text
    check (activation_source is null or activation_source in ('alert', 'manual')),
  activated_at timestamptz,
  activated_by uuid references public.users (id) on delete set null,
  activated_by_alert_id text,
  deactivated_at timestamptz,
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references public.users (id) on delete set null,
  sync_status text not null default 'synced'
    check (sync_status in ('pending', 'synced'))
);

create table if not exists public.households (
  id text primary key default gen_random_uuid()::text,
  head_name text not null,
  head_id text,
  barangay_id text not null,
  applicant_user_id uuid references public.users (id) on delete set null,
  applicant_email text,
  barangay_name text,
  municipality text,
  purok_sitio text not null,
  street_address text not null,
  landmark_directions text,
  contact_number text,
  supporting_document_name text,
  supporting_document_type text,
  supporting_document_data text,
  status text not null default 'active'
    check (status in ('active', 'moved_out', 'deceased')),
  gps_lat double precision,
  gps_long double precision,
  location_source text
    check (location_source in ('address_search', 'manual_pin', 'current_gps', 'admin_review')),
  location_confidence text
    check (location_confidence in ('low', 'medium', 'high')),
  location_verified boolean not null default false,
  location_verified_at timestamptz,
  location_verified_by uuid references public.users (id) on delete set null,
  registration_status text not null default 'pending'
    check (registration_status in ('pending', 'approved', 'rejected', 'needs_correction')),
  registration_submitted_at timestamptz,
  registration_reviewed_at timestamptz,
  registration_reviewed_by uuid references public.users (id) on delete set null,
  registration_review_notes text,
  pin_qa_status text not null default 'needs_verification'
    check (pin_qa_status in ('valid', 'duplicate', 'needs_verification')),
  pin_qa_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

create table if not exists public.residents (
  id text primary key default gen_random_uuid()::text,
  household_id text not null references public.households (id) on delete cascade,
  full_name text not null,
  first_name text not null default '',
  middle_name text not null default '',
  last_name text not null default '',
  birthdate date not null,
  gender text not null check (gender in ('M', 'F')),
  relationship_to_head text not null,
  status text not null default 'active'
    check (status in ('active', 'moved_out', 'deceased')),
  civil_status text
    check (civil_status in ('single', 'married', 'widowed', 'separated')),
  occupation text,
  income_level text
    check (income_level in ('low', 'middle', 'high')),
  contact_number text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

alter table public.households
  drop constraint if exists households_head_id_fkey;

alter table public.households
  add constraint households_head_id_fkey
  foreign key (head_id)
  references public.residents (id)
  on delete set null
  deferrable initially deferred;

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

create table if not exists public.vulnerability_flags (
  id text primary key default gen_random_uuid()::text,
  resident_id text not null unique references public.residents (id) on delete cascade,
  is_infant boolean not null default false,
  is_child boolean not null default false,
  is_adult boolean not null default false,
  is_senior boolean not null default false,
  is_pregnant boolean not null default false,
  pregnancy_months integer
    check (pregnancy_months between 1 and 9),
  expected_delivery_date date,
  is_pwd boolean not null default false,
  is_4ps boolean not null default false,
  is_indigent boolean not null default false,
  pwd_type text
    check (pwd_type in ('physical', 'visual', 'hearing', 'intellectual', 'psychosocial')),
  has_chronic_illness boolean not null default false,
    chronic_conditions text[] not null default '{}'::text[],
    is_low_income boolean not null default false,
    is_solo_parent boolean not null default false,
    solo_parent_id text,
    solo_parent_category text,
    follow_up_status text not null default 'none'
      check (follow_up_status in ('none', 'needs_visit', 'visited', 'referred', 'resolved')),
    medical_notes text,
    notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  check (
    (
      not is_pregnant
      and pregnancy_months is null
      and expected_delivery_date is null
    )
    or (
      is_pregnant
      and pregnancy_months between 1 and 9
      and expected_delivery_date is not null
    )
  )
);

alter table public.vulnerability_flags
  add column if not exists is_infant boolean not null default false,
  add column if not exists is_4ps boolean not null default false,
  add column if not exists is_indigent boolean not null default false,
  add column if not exists pregnancy_months integer,
  add column if not exists expected_delivery_date date,
  add column if not exists follow_up_status text not null default 'none',
  add column if not exists medical_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vulnerability_flags_follow_up_status_check'
      and conrelid = 'public.vulnerability_flags'::regclass
  ) then
    alter table public.vulnerability_flags
      add constraint vulnerability_flags_follow_up_status_check
      check (follow_up_status in ('none', 'needs_visit', 'visited', 'referred', 'resolved'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vulnerability_flags_pregnancy_months_check'
      and conrelid = 'public.vulnerability_flags'::regclass
  ) then
    alter table public.vulnerability_flags
      add constraint vulnerability_flags_pregnancy_months_check
      check (pregnancy_months is null or pregnancy_months between 1 and 9);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vulnerability_flags_pregnancy_tracking_check'
      and conrelid = 'public.vulnerability_flags'::regclass
  ) then
    alter table public.vulnerability_flags
      add constraint vulnerability_flags_pregnancy_tracking_check
      check (
        (
          not is_pregnant
          and pregnancy_months is null
          and expected_delivery_date is null
        )
        or (
          is_pregnant
          and pregnancy_months between 1 and 9
          and expected_delivery_date is not null
        )
      );
  end if;
end $$;

create table if not exists public.programs (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.beneficiaries (
  id text primary key default gen_random_uuid()::text,
  program_id text not null references public.programs (id) on delete cascade,
  resident_id text not null references public.residents (id) on delete cascade,
  enrollment_date date not null default current_date,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  unique (program_id, resident_id)
);

create table if not exists public.inventory_items (
  id text primary key default gen_random_uuid()::text,
  item_name text not null,
  item_code text unique,
  category text not null
    check (category in ('food', 'medicine', 'hygiene', 'clothing', 'blankets', 'other')),
  status text not null default 'active'
    check (status in ('active', 'trashed')),
  quantity_available numeric(14, 2) not null default 0 check (quantity_available >= 0),
  unit text not null check (unit in ('pcs', 'kg', 'box', 'pack', 'bundle')),
  reorder_level numeric(14, 2) default 10 check (reorder_level is null or reorder_level >= 0),
  storage_location text,
  expiration_date date,
  notes text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

create table if not exists public.inventory_movements (
  id text primary key default gen_random_uuid()::text,
  item_id text not null references public.inventory_items (id) on delete cascade,
  item_name text not null,
  type text not null
    check (type in ('stock_in', 'stock_out', 'adjustment', 'distribution_release', 'transfer')),
  quantity numeric(14, 2) not null check (quantity >= 0),
  previous_quantity numeric(14, 2) not null,
  new_quantity numeric(14, 2) not null check (new_quantity >= 0),
  unit text not null check (unit in ('pcs', 'kg', 'box', 'pack', 'bundle')),
  performed_by uuid references public.users (id) on delete set null,
  performed_by_name text,
  reference_id text,
  reference_type text
    check (reference_type in ('inventory', 'distribution', 'manual', 'transfer')),
  notes text,
  "timestamp" timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

create table if not exists public.package_templates (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  check (jsonb_typeof(items) = 'array')
);

create table if not exists public.distribution_events (
  id text primary key default gen_random_uuid()::text,
  event_name text not null,
  type text not null
    check (type in ('regular', 'emergency', 'disaster_relief')),
  incident_id text,
  target_scope text not null
    check (target_scope in ('household', 'resident')),
  target_group text not null
    check (target_group in ('all', 'senior', 'pwd', 'pregnant', 'minor', 'low_income')),
  package_items jsonb not null default '[]'::jsonb,
  location text not null,
  gps_lat double precision,
  gps_lng double precision,
  scheduled_date date not null,
  status text not null default 'planned'
    check (status in ('planned', 'ongoing', 'completed')),
  created_by uuid not null references public.users (id) on delete restrict,
  notes text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  check (jsonb_typeof(package_items) = 'array')
);

create table if not exists public.distribution_records (
  id text primary key default gen_random_uuid()::text,
  event_id text not null references public.distribution_events (id) on delete cascade,
  household_id text references public.households (id) on delete set null,
  resident_id text references public.residents (id) on delete set null,
  beneficiary_name text,
  items_distributed jsonb not null default '[]'::jsonb,
  received_by_name text,
  "timestamp" timestamptz not null default timezone('utc', now()),
  distributor_id uuid not null references public.users (id) on delete restrict,
  notes text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  check (jsonb_typeof(items_distributed) = 'array'),
  check (
    (household_id is not null and resident_id is null)
    or (household_id is null and resident_id is not null)
  )
);

create table if not exists public.distribution_qr_scan_logs (
  id text primary key default gen_random_uuid()::text,
  event_id text not null references public.distribution_events (id) on delete cascade,
  household_id text references public.households (id) on delete set null,
  claimant_user_id uuid references public.users (id) on delete set null,
  scanned_by uuid references public.users (id) on delete set null,
  source text not null default 'manual'
    check (source in ('camera', 'manual', 'link')),
  status text not null
    check (status in ('resolved', 'rejected', 'released')),
  token_hash text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.incidents (
  id text primary key default gen_random_uuid()::text,
  type text not null
    check (type in ('flood', 'fire', 'medical', 'landslide', 'typhoon', 'other')),
  location text not null,
  gps_lat double precision,
  gps_lng double precision,
  severity text not null
    check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'reported'
    check (status in ('reported', 'verified', 'responding', 'resolved')),
  reported_by uuid not null references public.users (id) on delete restrict,
  reported_at timestamptz not null default timezone('utc', now()),
  photo_url text,
  description text not null,
  source text
    check (source in ('manual', 'alert')),
  source_alert_id text,
  source_rule_id text,
  hazard_context text
    check (hazard_context in ('flood', 'typhoon', 'landslide', 'storm_surge', 'fire', 'earthquake')),
  context_snapshot jsonb,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

alter table public.distribution_events
  drop constraint if exists distribution_events_incident_id_fkey;

alter table public.distribution_events
  add constraint distribution_events_incident_id_fkey
  foreign key (incident_id)
  references public.incidents (id)
  on delete set null;

create table if not exists public.audit_logs (
  id text primary key default gen_random_uuid()::text,
  user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null
    check (entity_type in ('household', 'resident', 'distribution', 'incident', 'inventory', 'user', 'location_master', 'disaster_alert', 'disaster_alert_rule', 'purok_risk_profile', 'evacuation_center', 'case', 'aics_record', 'aics_daily_budget')),
  entity_id text not null,
  changes jsonb,
  "timestamp" timestamptz not null default timezone('utc', now())
);

create table if not exists public.sync_backups (
  id bigint generated by default as identity primary key,
  queue_id text not null,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('create', 'update', 'delete')),
  data jsonb,
  client_timestamp timestamptz not null,
  synced_at timestamptz not null default timezone('utc', now()),
  synced_by uuid references public.users (id) on delete set null,
  unique (queue_id)
);

create table if not exists public.password_setup_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz
);

create table if not exists public.email_verification_tokens (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  used_at timestamptz
);

create table if not exists public.cases (
  id text primary key default ('case_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  case_number text not null unique,
  case_type text not null check (
    case_type in (
      'vawc_physical',
      'vawc_psychological',
      'vawc_sexual',
      'vawc_economic',
      'vac_abuse',
      'vac_neglect',
      'vac_exploitation',
      'rape',
      'acts_of_lasciviousness',
      'cicl',
      'other'
    )
  ),
  reported_at timestamptz not null default timezone('utc', now()),
  incident_date date,
  victim_name text not null,
  victim_age integer check (victim_age is null or (victim_age >= 0 and victim_age <= 130)),
  victim_gender text check (victim_gender is null or victim_gender in ('F', 'M', 'Other')),
  victim_contact text,
  victim_address text,
  barangay_id text not null default 'cadunan',
  purok_sitio text,
  perpetrator_name text,
  perpetrator_relationship text,
  perpetrator_address text,
  status text not null default 'active' check (
    status in (
      'active',
      'under_bpo_tpo',
      'referred_pnp_wcpd',
      'filed_in_court',
      'resolved_closed',
      'monitoring'
    )
  ),
  case_summary text not null,
  intake_notes text,
  assigned_worker_id text,
  assigned_worker_name text,
  resident_id text references public.residents (id) on delete set null,
  household_id text references public.households (id) on delete set null,
  source text not null default 'manual_intake' check (source in ('excel_import', 'manual_intake')),
  intake_sheet jsonb default null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_attachments (
  id text primary key default ('att_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  case_id text not null references public.cases (id) on delete cascade,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size integer,
  file_url text not null,
  document_type text not null default 'intake_sheet' check (
    document_type in (
      'intake_sheet',
      'bpo_tpo',
      'medico_legal',
      'pnp_blotter',
      'court_order',
      'progress_report',
      'other'
    )
  ),
  uploaded_by text not null default 'Social Worker',
  uploaded_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.case_notes (
  id text primary key default ('note_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  case_id text not null references public.cases (id) on delete cascade,
  worker_id text,
  worker_name text not null default 'Social Worker',
  date date not null default current_date,
  note text not null,
  action_taken text,
  next_follow_up date,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.solo_parents (
  id text primary key default gen_random_uuid()::text,
  id_number text unique not null,
  resident_id text references public.residents(id) on delete set null,
  household_id text references public.households(id) on delete set null,
  full_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  birthdate date not null,
  age integer default 0,
  gender text default 'F',
  civil_status text,
  contact_number text,
  barangay_id text not null,
  purok_sitio text,
  street_address text,
  category text not null check (
    category in (
      'death_of_spouse',
      'abandonment',
      'unmarried',
      'legal_separation',
      'spouse_detained',
      'spouse_incapacitated',
      'other_extenuating'
    )
  ),
  category_narrative text,
  monthly_income numeric default 0,
  is_minimum_wage_or_below boolean default false,
  occupation text,
  employment_status text,
  dependents jsonb default '[]'::jsonb,
  requirements jsonb default '{}'::jsonb,
  issued_at date not null,
  expires_at date not null,
  encoder_id text,
  encoder_name text not null default 'MSWDO Desk Officer',
  notes text,
  status text not null default 'active' check (status in ('active', 'expiring', 'expired', 'revoked')),
  revocation_reason text,
  revocation_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.forecasting_dataset_uploads (
  id text primary key,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  compressed_size_bytes bigint not null check (compressed_size_bytes >= 0),
  file_type text not null check (file_type in ('xlsx', 'xls', 'csv')),
  storage_path text,
  records_count integer not null default 0 check (records_count >= 0),
  accuracy_rate numeric(5, 2) not null default 0,
  mape_percent numeric(5, 2) not null default 0,
  mae_error numeric(8, 2) not null default 0,
  uploaded_by text not null default 'MSWDO Staff',
  uploaded_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  dataset_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists households_barangay_id_idx on public.households (barangay_id);
create index if not exists households_registration_status_idx on public.households (registration_status);
create index if not exists households_status_idx on public.households (status);
create index if not exists residents_household_id_idx on public.residents (household_id);
create index if not exists residents_birthdate_idx on public.residents (birthdate);
create index if not exists residents_status_idx on public.residents (status);
create index if not exists vulnerability_flags_is_senior_idx on public.vulnerability_flags (is_senior);
create index if not exists vulnerability_flags_is_pwd_idx on public.vulnerability_flags (is_pwd);
create index if not exists vulnerability_flags_is_pregnant_idx on public.vulnerability_flags (is_pregnant);
create index if not exists vulnerability_flags_is_low_income_idx on public.vulnerability_flags (is_low_income);
create index if not exists beneficiaries_resident_id_idx on public.beneficiaries (resident_id);
create index if not exists inventory_items_status_idx on public.inventory_items (status);
create index if not exists inventory_movements_item_id_idx on public.inventory_movements (item_id);
create index if not exists inventory_movements_timestamp_idx on public.inventory_movements ("timestamp" desc);
create index if not exists distribution_events_scheduled_date_idx on public.distribution_events (scheduled_date);
create index if not exists distribution_events_status_idx on public.distribution_events (status);
create index if not exists distribution_records_event_id_idx on public.distribution_records (event_id);
create index if not exists distribution_qr_scan_logs_event_id_idx on public.distribution_qr_scan_logs (event_id, created_at desc);
create index if not exists distribution_qr_scan_logs_household_id_idx on public.distribution_qr_scan_logs (household_id, created_at desc);
create index if not exists incidents_status_idx on public.incidents (status);
create index if not exists incidents_reported_at_idx on public.incidents (reported_at desc);
create index if not exists incidents_source_alert_id_idx on public.incidents (source_alert_id);
create index if not exists audit_logs_timestamp_idx on public.audit_logs ("timestamp" desc);
create index if not exists sync_backups_entity_idx on public.sync_backups (entity_type, entity_id, synced_at desc);
create index if not exists password_setup_tokens_user_id_idx on public.password_setup_tokens (user_id, used_at, expires_at desc);
create index if not exists email_verification_tokens_user_id_idx on public.email_verification_tokens (user_id, used_at, expires_at desc);
create index if not exists purok_risk_profiles_barangay_id_idx on public.purok_risk_profiles (barangay_id);

create unique index if not exists purok_risk_profiles_barangay_purok_idx
  on public.purok_risk_profiles (barangay_id, purok_sitio);

create index if not exists evacuation_centers_barangay_id_idx
  on public.evacuation_centers (barangay_id);

create index if not exists evacuation_centers_status_idx
  on public.evacuation_centers (status);

create unique index if not exists evacuation_centers_barangay_name_idx
  on public.evacuation_centers (barangay_id, lower(trim(name)));

create unique index if not exists distribution_records_unique_household_per_event
  on public.distribution_records (event_id, household_id)
  where household_id is not null;

create unique index if not exists distribution_records_unique_resident_per_event
  on public.distribution_records (event_id, resident_id)
  where resident_id is not null;

create index if not exists cases_case_number_idx on public.cases (case_number);
create index if not exists cases_victim_name_idx on public.cases (victim_name);
create index if not exists cases_barangay_id_idx on public.cases (barangay_id);
create index if not exists cases_status_idx on public.cases (status);
create index if not exists cases_case_type_idx on public.cases (case_type);
create index if not exists cases_resident_id_idx on public.cases (resident_id);
create index if not exists cases_reported_at_idx on public.cases (reported_at desc);
create index if not exists cases_intake_sheet_gin_idx on public.cases using gin (intake_sheet);
create index if not exists case_attachments_case_id_idx on public.case_attachments (case_id);
create index if not exists case_notes_case_id_idx on public.case_notes (case_id);
create index if not exists idx_solo_parents_resident_id on public.solo_parents (resident_id);
create index if not exists idx_solo_parents_household_id on public.solo_parents (household_id);
create index if not exists idx_solo_parents_barangay_id on public.solo_parents (barangay_id);
create index if not exists idx_solo_parents_status on public.solo_parents (status);
create index if not exists idx_solo_parents_id_number on public.solo_parents (id_number);
create index if not exists idx_solo_parents_expires_at on public.solo_parents (expires_at);
create index if not exists forecasting_dataset_uploads_uploaded_at_idx on public.forecasting_dataset_uploads (uploaded_at desc);
create index if not exists forecasting_dataset_uploads_is_active_idx on public.forecasting_dataset_uploads (is_active);

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

drop trigger if exists location_master_lists_set_updated_at on public.location_master_lists;
create trigger location_master_lists_set_updated_at
before update on public.location_master_lists
for each row
execute function public.set_updated_at();

drop trigger if exists purok_risk_profiles_set_updated_at on public.purok_risk_profiles;
create trigger purok_risk_profiles_set_updated_at
before update on public.purok_risk_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists evacuation_centers_set_updated_at on public.evacuation_centers;
create trigger evacuation_centers_set_updated_at
before update on public.evacuation_centers
for each row
execute function public.set_updated_at();

drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at
before update on public.households
for each row
execute function public.set_updated_at();

drop trigger if exists residents_set_updated_at on public.residents;
create trigger residents_set_updated_at
before update on public.residents
for each row
execute function public.set_updated_at();

drop trigger if exists vulnerability_flags_set_updated_at on public.vulnerability_flags;
create trigger vulnerability_flags_set_updated_at
before update on public.vulnerability_flags
for each row
execute function public.set_updated_at();

drop trigger if exists package_templates_set_updated_at on public.package_templates;
create trigger package_templates_set_updated_at
before update on public.package_templates
for each row
execute function public.set_updated_at();

drop trigger if exists cases_set_updated_at on public.cases;
create trigger cases_set_updated_at
before update on public.cases
for each row
execute function public.set_updated_at();

drop trigger if exists solo_parents_set_updated_at on public.solo_parents;
create trigger solo_parents_set_updated_at
before update on public.solo_parents
for each row
execute function public.set_updated_at();

drop trigger if exists forecasting_dataset_uploads_set_updated_at on public.forecasting_dataset_uploads;
create trigger forecasting_dataset_uploads_set_updated_at
before update on public.forecasting_dataset_uploads
for each row
execute function public.set_updated_at();

create or replace function public.refresh_vulnerability_flags_for_resident(p_resident_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resident public.residents%rowtype;
  v_age int;
  v_category text;
begin
  select *
  into v_resident
  from public.residents
  where id = p_resident_id;

  if not found then
    delete from public.vulnerability_flags
    where resident_id = p_resident_id;
    return;
  end if;

  v_age := extract(year from age(current_date, v_resident.birthdate));
  v_age := greatest(v_age, 0);

  v_category := case
    when v_age < 18 then 'child'
    when v_age < 60 then 'adult'
    else 'senior'
  end;

  insert into public.vulnerability_flags (
    resident_id,
    is_child,
    is_adult,
    is_senior,
    is_low_income,
    notes,
    sync_status
  )
  values (
    v_resident.id,
    v_age < 18,
    v_age >= 18 and v_age < 60,
    v_age >= 60,
    coalesce(v_resident.income_level = 'low', false),
    format(
      'Auto-categorized as %s (age %s) on %s',
      v_category,
      v_age,
      to_char(current_date, 'YYYY-MM-DD')
    ),
    'pending'
  )
  on conflict (resident_id) do update
  set
    is_child = excluded.is_child,
    is_adult = excluded.is_adult,
    is_senior = excluded.is_senior,
    is_low_income = excluded.is_low_income,
    notes = excluded.notes,
    sync_status = 'pending',
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.refresh_all_vulnerability_flags()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resident record;
begin
  for v_resident in
    select id from public.residents
  loop
    perform public.refresh_vulnerability_flags_for_resident(v_resident.id);
  end loop;
end;
$$;

create or replace function public.handle_resident_vulnerability_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_vulnerability_flags_for_resident(new.id);
  return new;
end;
$$;

create or replace function public.handle_resident_vulnerability_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.vulnerability_flags
  where resident_id = old.id;
  return old;
end;
$$;

drop trigger if exists residents_refresh_vulnerability_after_insert on public.residents;
create trigger residents_refresh_vulnerability_after_insert
after insert on public.residents
for each row
execute function public.handle_resident_vulnerability_sync();

drop trigger if exists residents_refresh_vulnerability_after_update on public.residents;
create trigger residents_refresh_vulnerability_after_update
after update of birthdate, income_level on public.residents
for each row
execute function public.handle_resident_vulnerability_sync();

drop trigger if exists residents_delete_vulnerability_flags on public.residents;
create trigger residents_delete_vulnerability_flags
after delete on public.residents
for each row
execute function public.handle_resident_vulnerability_delete();

create or replace function public.can_access_household(target_household_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and (
        public.is_admin()
        or (
          public.current_user_role() in ('encoder', 'health_worker', 'responder', 'social_worker', 'solo_parent_focal')
          and h.barangay_id = public.current_user_barangay_id()
        )
        or (
          public.current_user_role() = 'resident'
          and h.applicant_user_id = auth.uid()
        )
      )
  )
$$;

create or replace function public.can_access_resident(target_resident_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.residents r
    join public.households h on h.id = r.household_id
    where r.id = target_resident_id
      and (
        public.is_admin()
        or (
          public.current_user_role() in ('encoder', 'health_worker', 'responder')
          and h.barangay_id = public.current_user_barangay_id()
        )
        or (
          public.current_user_role() = 'resident'
          and h.applicant_user_id = auth.uid()
        )
      )
  )
$$;

alter table public.users enable row level security;
alter table public.location_master_lists enable row level security;
alter table public.purok_risk_profiles enable row level security;
alter table public.evacuation_centers enable row level security;
alter table public.households enable row level security;
alter table public.residents enable row level security;
alter table public.vulnerability_flags enable row level security;
alter table public.programs enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.package_templates enable row level security;
alter table public.distribution_events enable row level security;
alter table public.distribution_records enable row level security;
alter table public.distribution_qr_scan_logs enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_backups enable row level security;
alter table public.password_setup_tokens enable row level security;
alter table public.email_verification_tokens enable row level security;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
on public.users
for select
using (public.current_user_is_active() and (auth.uid() = id or public.is_admin()));

drop policy if exists "users_update_admin_only" on public.users;
create policy "users_update_admin_only"
on public.users
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "location_master_lists_read_authenticated" on public.location_master_lists;
drop policy if exists "location_master_lists_read_scoped" on public.location_master_lists;
create policy "location_master_lists_read_scoped"
on public.location_master_lists
for select
using (
  public.current_user_is_active()
  and (
    public.is_admin()
    or barangay_id = public.current_user_barangay_id()
  )
);

drop policy if exists "location_master_lists_write_admin" on public.location_master_lists;
create policy "location_master_lists_write_admin"
on public.location_master_lists
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "purok_risk_profiles_read_authenticated" on public.purok_risk_profiles;
drop policy if exists "purok_risk_profiles_read_scoped" on public.purok_risk_profiles;
create policy "purok_risk_profiles_read_scoped"
on public.purok_risk_profiles
for select
using (
  public.current_user_is_active()
  and (
    public.is_admin()
    or barangay_id = public.current_user_barangay_id()
  )
);

drop policy if exists "purok_risk_profiles_write_admin" on public.purok_risk_profiles;
create policy "purok_risk_profiles_write_admin"
on public.purok_risk_profiles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "evacuation_centers_read_authenticated" on public.evacuation_centers;
drop policy if exists "evacuation_centers_read_scoped" on public.evacuation_centers;
create policy "evacuation_centers_read_scoped"
on public.evacuation_centers
for select
using (
  public.current_user_is_active()
  and (
    public.is_admin()
    or barangay_id = public.current_user_barangay_id()
  )
);

drop policy if exists "evacuation_centers_write_admin" on public.evacuation_centers;
create policy "evacuation_centers_write_admin"
on public.evacuation_centers
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "evacuation_centers_status_responder" on public.evacuation_centers;
create policy "evacuation_centers_status_responder"
on public.evacuation_centers
for update
using (
  public.current_user_is_active()
  and public.current_user_role() = 'responder'
  and barangay_id = public.current_user_barangay_id()
)
with check (
  public.current_user_is_active()
  and public.current_user_role() = 'responder'
  and barangay_id = public.current_user_barangay_id()
);

drop policy if exists "households_select_accessible" on public.households;
create policy "households_select_accessible"
on public.households
for select
using (public.can_access_household(id));

drop policy if exists "households_insert_staff_or_resident" on public.households;
create policy "households_insert_staff_or_resident"
on public.households
for insert
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'encoder'
    and barangay_id = public.current_user_barangay_id()
  )
  or (
    public.current_user_role() = 'resident'
    and applicant_user_id = auth.uid()
  )
);

drop policy if exists "households_update_accessible" on public.households;
create policy "households_update_accessible"
on public.households
for update
using (
  public.is_admin()
  or (
    public.current_user_role() = 'encoder'
    and barangay_id = public.current_user_barangay_id()
  )
  or (
    public.current_user_role() = 'resident'
    and applicant_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'encoder'
    and barangay_id = public.current_user_barangay_id()
  )
  or (
    public.current_user_role() = 'resident'
    and applicant_user_id = auth.uid()
  )
);

drop policy if exists "households_delete_admin_or_encoder" on public.households;
create policy "households_delete_admin_or_encoder"
on public.households
for delete
using (
  public.is_admin()
  or (
    public.current_user_role() = 'encoder'
    and barangay_id = public.current_user_barangay_id()
  )
);

drop policy if exists "residents_select_accessible" on public.residents;
create policy "residents_select_accessible"
on public.residents
for select
using (public.can_access_household(household_id));

drop policy if exists "residents_write_admin_or_encoder" on public.residents;
create policy "residents_write_admin_or_encoder"
on public.residents
for all
using (
  public.is_admin()
  or (
    public.current_user_role() = 'encoder'
    and public.can_access_household(household_id)
  )
)
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'encoder'
    and public.can_access_household(household_id)
  )
);

drop policy if exists "vulnerability_flags_select_staff" on public.vulnerability_flags;
create policy "vulnerability_flags_select_staff"
on public.vulnerability_flags
for select
using (
  public.can_access_resident(resident_id)
  and coalesce(public.current_user_role(), '') in ('admin', 'encoder', 'health_worker', 'responder')
);

drop policy if exists "vulnerability_flags_update_admin_or_health_worker" on public.vulnerability_flags;
create policy "vulnerability_flags_update_admin_or_health_worker"
on public.vulnerability_flags
for update
using (
  public.is_admin()
  or (
    public.current_user_role() = 'health_worker'
    and public.can_access_resident(resident_id)
  )
)
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'health_worker'
    and public.can_access_resident(resident_id)
  )
);

drop policy if exists "vulnerability_flags_insert_admin_or_health_worker" on public.vulnerability_flags;
create policy "vulnerability_flags_insert_admin_or_health_worker"
on public.vulnerability_flags
for insert
with check (
  public.is_admin()
  or (
    public.current_user_role() = 'health_worker'
    and public.can_access_resident(resident_id)
  )
);

drop policy if exists "programs_read_authenticated" on public.programs;
create policy "programs_read_authenticated"
on public.programs
for select
using (public.current_user_is_active());

drop policy if exists "programs_write_admin" on public.programs;
create policy "programs_write_admin"
on public.programs
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "beneficiaries_read_authenticated" on public.beneficiaries;
drop policy if exists "beneficiaries_read_scoped" on public.beneficiaries;
create policy "beneficiaries_read_scoped"
on public.beneficiaries
for select
using (public.current_user_is_active() and public.can_access_beneficiary(id));

drop policy if exists "beneficiaries_write_admin" on public.beneficiaries;
create policy "beneficiaries_write_admin"
on public.beneficiaries
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "inventory_items_staff_access" on public.inventory_items;
create policy "inventory_items_staff_access"
on public.inventory_items
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

drop policy if exists "inventory_movements_staff_access" on public.inventory_movements;
create policy "inventory_movements_staff_access"
on public.inventory_movements
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

drop policy if exists "package_templates_staff_access" on public.package_templates;
create policy "package_templates_staff_access"
on public.package_templates
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

drop policy if exists "distribution_events_staff_access" on public.distribution_events;
create policy "distribution_events_staff_access"
on public.distribution_events
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

drop policy if exists "distribution_records_staff_access" on public.distribution_records;
create policy "distribution_records_staff_access"
on public.distribution_records
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

drop policy if exists "distribution_qr_scan_logs_staff_access" on public.distribution_qr_scan_logs;
create policy "distribution_qr_scan_logs_staff_access"
on public.distribution_qr_scan_logs
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

drop policy if exists "incidents_select_staff" on public.incidents;
create policy "incidents_select_staff"
on public.incidents
for select
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder', 'health_worker', 'responder'));

drop policy if exists "incidents_write_admin_or_responder" on public.incidents;
create policy "incidents_write_admin_or_responder"
on public.incidents
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'responder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'responder'));

drop policy if exists "audit_logs_select_self_or_admin" on public.audit_logs;
create policy "audit_logs_select_self_or_admin"
on public.audit_logs
for select
using (public.current_user_is_active() and (public.is_admin() or user_id = auth.uid()));

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own"
on public.audit_logs
for insert
with check (public.current_user_is_active() and user_id = auth.uid());

drop policy if exists "sync_backups_select_admin" on public.sync_backups;
create policy "sync_backups_select_admin"
on public.sync_backups
for select
using (public.is_admin());

drop policy if exists "sync_backups_insert_own" on public.sync_backups;
create policy "sync_backups_insert_own"
on public.sync_backups
for insert
with check (public.current_user_is_active() and synced_by = auth.uid());

-- Cases RLS
alter table public.cases enable row level security;
alter table public.case_attachments enable row level security;
alter table public.case_notes enable row level security;

drop policy if exists "cases_select_authorized" on public.cases;
create policy "cases_select_authorized"
on public.cases
for select
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "cases_insert_authorized" on public.cases;
create policy "cases_insert_authorized"
on public.cases
for insert
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "cases_update_authorized" on public.cases;
create policy "cases_update_authorized"
on public.cases
for update
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
)
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "cases_delete_admin_only" on public.cases;
create policy "cases_delete_admin_only"
on public.cases
for delete
using (
  public.current_user_is_active()
  and public.is_admin()
);

drop policy if exists "case_attachments_select_authorized" on public.case_attachments;
create policy "case_attachments_select_authorized"
on public.case_attachments
for select
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "case_attachments_insert_authorized" on public.case_attachments;
create policy "case_attachments_insert_authorized"
on public.case_attachments
for insert
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "case_attachments_delete_authorized" on public.case_attachments;
create policy "case_attachments_delete_authorized"
on public.case_attachments
for delete
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "case_notes_select_authorized" on public.case_notes;
create policy "case_notes_select_authorized"
on public.case_notes
for select
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "case_notes_insert_authorized" on public.case_notes;
create policy "case_notes_insert_authorized"
on public.case_notes
for insert
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

drop policy if exists "case_notes_update_authorized" on public.case_notes;
create policy "case_notes_update_authorized"
on public.case_notes
for update
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
)
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

-- Solo Parents RLS
alter table public.solo_parents enable row level security;

drop policy if exists "staff_solo_parents_access" on public.solo_parents;
create policy "staff_solo_parents_access"
on public.solo_parents
for all
using (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('admin', 'solo_parent_focal', 'social_worker')
  )
)
with check (
  exists (
    select 1 from public.users
    where users.id = auth.uid()
      and users.role in ('admin', 'solo_parent_focal', 'social_worker')
  )
);

drop policy if exists "residents_view_own_solo_parent" on public.solo_parents;
create policy "residents_view_own_solo_parent"
on public.solo_parents
for select
using (
  exists (
    select 1 from public.residents r
    join public.households h on h.id = r.household_id
    where r.id = solo_parents.resident_id
      and h.applicant_user_id = auth.uid()
  )
);

-- Forecasting Dataset Uploads RLS
alter table public.forecasting_dataset_uploads enable row level security;

drop policy if exists "forecasting_dataset_uploads_read" on public.forecasting_dataset_uploads;
create policy "forecasting_dataset_uploads_read"
on public.forecasting_dataset_uploads
for select
using (
  public.current_user_is_active()
  or auth.role() = 'authenticated'
);

drop policy if exists "forecasting_dataset_uploads_write" on public.forecasting_dataset_uploads;
create policy "forecasting_dataset_uploads_write"
on public.forecasting_dataset_uploads
for all
using (
  public.current_user_is_active()
  or auth.role() = 'authenticated'
)
with check (
  public.current_user_is_active()
  or auth.role() = 'authenticated'
);

-- -----------------------------------------------------------------------------
-- AICS Records & Daily Assistance Fund Budgets
-- -----------------------------------------------------------------------------
create table if not exists public.aics_records (
  id text primary key default ('aics_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  control_number text not null unique,
  intake_date date not null default current_date,
  intake_category text not null check (
    intake_category in ('walk_in', 'referred', 'rescued')
  ),
  sectors jsonb not null default '[]'::jsonb,
  client_category text not null check (
    client_category in ('fhona', 'senior_citizen', 'pwd', 'ynsp')
  ),
  sub_category text not null,
  client_name text not null,
  client_age integer default 0 check (client_age is null or (client_age >= 0 and client_age <= 130)),
  client_gender text default 'Female',
  barangay_id text not null,
  purok_sitio text,
  contact_number text,
  resident_id text references public.residents(id) on delete set null,
  household_id text references public.households(id) on delete set null,
  assistance_type text not null check (
    assistance_type in (
      'medical',
      'burial',
      'educational',
      'food_transportation',
      'disaster_distress',
      'other'
    )
  ),
  specific_assistance text not null,
  amount_approved numeric not null default 0 check (amount_approved >= 0),
  disbursement_type text not null default 'cash',
  status text not null default 'pending' check (
    status in ('pending', 'assessed', 'approved', 'disbursed', 'liquidated')
  ),
  intake_sheet jsonb not null default '{}'::jsonb,
  assigned_worker_id text,
  assigned_worker_name text not null default 'MSWDO AICS Officer',
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_aics_records_updated_at on public.aics_records;
create trigger set_aics_records_updated_at
  before update on public.aics_records
  for each row
  execute function public.set_updated_at();

create index if not exists idx_aics_records_control_number on public.aics_records (control_number);
create index if not exists idx_aics_records_resident_id on public.aics_records (resident_id);
create index if not exists idx_aics_records_household_id on public.aics_records (household_id);
create index if not exists idx_aics_records_barangay_id on public.aics_records (barangay_id);
create index if not exists idx_aics_records_client_category on public.aics_records (client_category);
create index if not exists idx_aics_records_assistance_type on public.aics_records (assistance_type);
create index if not exists idx_aics_records_status on public.aics_records (status);
create index if not exists idx_aics_records_intake_date on public.aics_records (intake_date desc);
create index if not exists idx_aics_records_is_deleted on public.aics_records (is_deleted);

alter table public.aics_records enable row level security;

drop policy if exists "staff_aics_access" on public.aics_records;
create policy "staff_aics_access"
  on public.aics_records
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'aics_focal')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'aics_focal')
    )
  );

drop policy if exists "residents_view_own_aics_records" on public.aics_records;
create policy "residents_view_own_aics_records"
  on public.aics_records
  for select
  using (
    exists (
      select 1 from public.residents r
      join public.households h on h.id = r.household_id
      where (r.id = aics_records.resident_id or h.id = aics_records.household_id)
        and h.applicant_user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- AICS Daily Budgets Table
-- -----------------------------------------------------------------------------
create table if not exists public.aics_daily_budgets (
  id text primary key default ('aics_budget_' || current_date::text),
  date date not null unique default current_date,
  allocated_amount numeric not null default 0 check (allocated_amount >= 0),
  initial_amount numeric not null default 0 check (initial_amount >= 0),
  top_ups jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  notes text default 'Standard Municipal Daily Allocation',
  created_by text default 'MSWDO Admin',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists set_aics_daily_budgets_updated_at on public.aics_daily_budgets;
create trigger set_aics_daily_budgets_updated_at
  before update on public.aics_daily_budgets
  for each row
  execute function public.set_updated_at();

create index if not exists idx_aics_daily_budgets_date on public.aics_daily_budgets (date desc);

alter table public.aics_daily_budgets enable row level security;

drop policy if exists "staff_aics_daily_budgets_access" on public.aics_daily_budgets;
create policy "staff_aics_daily_budgets_access"
  on public.aics_daily_budgets
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'aics_focal')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'aics_focal')
    )
  );

drop policy if exists "authenticated_read_aics_daily_budgets" on public.aics_daily_budgets;
create policy "authenticated_read_aics_daily_budgets"
  on public.aics_daily_budgets
  for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- Replica Identities for Realtime
-- -----------------------------------------------------------------------------
alter table public.households replica identity full;
alter table public.residents replica identity full;
alter table public.vulnerability_flags replica identity full;
alter table public.programs replica identity full;
alter table public.beneficiaries replica identity full;
alter table public.inventory_items replica identity full;
alter table public.inventory_movements replica identity full;
alter table public.package_templates replica identity full;
alter table public.distribution_events replica identity full;
alter table public.distribution_records replica identity full;
alter table public.distribution_qr_scan_logs replica identity full;
alter table public.incidents replica identity full;
alter table public.location_master_lists replica identity full;
alter table public.purok_risk_profiles replica identity full;
alter table public.audit_logs replica identity full;
alter table public.sync_backups replica identity full;
alter table public.password_setup_tokens replica identity full;
alter table public.email_verification_tokens replica identity full;
alter table public.cases replica identity full;
alter table public.case_attachments replica identity full;
alter table public.case_notes replica identity full;
alter table public.solo_parents replica identity full;
alter table public.forecasting_dataset_uploads replica identity full;
alter table public.aics_records replica identity full;
alter table public.aics_daily_budgets replica identity full;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'users',
    'location_master_lists',
    'purok_risk_profiles',
    'evacuation_centers',
    'households',
    'residents',
    'vulnerability_flags',
    'programs',
    'beneficiaries',
    'inventory_items',
    'inventory_movements',
    'package_templates',
    'distribution_events',
    'distribution_records',
    'distribution_qr_scan_logs',
    'incidents',
    'audit_logs',
    'sync_backups',
    'cases',
    'case_attachments',
    'case_notes',
    'solo_parents',
    'forecasting_dataset_uploads',
    'aics_records',
    'aics_daily_budgets'
  ];
begin
  foreach v_table in array v_tables
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

commit;
