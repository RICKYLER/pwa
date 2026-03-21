-- MSWDO Census PWA - baseline Supabase migration
-- Generated from supabase/schema.sql for Supabase CLI migration tracking.

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
  role text not null default 'resident'
    check (role in ('admin', 'encoder', 'health_worker', 'responder', 'resident')),
  barangay_id text not null default 'barangay-1',
  must_change_password boolean not null default false,
  email_verification_required boolean not null default false,
  email_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
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

  v_barangay_id := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'barangay_id'), ''),
    'barangay-1'
  );

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
  values (
    new.id,
    coalesce(new.email, ''),
    v_name,
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
  coalesce(nullif(trim(au.raw_user_meta_data ->> 'barangay_id'), ''), 'barangay-1'),
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

create table if not exists public.vulnerability_flags (
  id text primary key default gen_random_uuid()::text,
  resident_id text not null unique references public.residents (id) on delete cascade,
  is_child boolean not null default false,
  is_adult boolean not null default false,
  is_senior boolean not null default false,
  is_pregnant boolean not null default false,
  is_pwd boolean not null default false,
  pwd_type text
    check (pwd_type in ('physical', 'visual', 'hearing', 'intellectual', 'psychosocial')),
  has_chronic_illness boolean not null default false,
  chronic_conditions text[] not null default '{}'::text[],
  is_low_income boolean not null default false,
  notes text,
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced'))
);

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
  user_id uuid not null references public.users (id) on delete restrict,
  action text not null,
  entity_type text not null
    check (entity_type in ('household', 'resident', 'distribution', 'incident', 'inventory', 'user', 'location_master')),
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
  synced_by uuid not null references public.users (id) on delete restrict,
  unique (queue_id)
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
create index if not exists inventory_movements_item_id_idx on public.inventory_movements (item_id);
create index if not exists inventory_movements_timestamp_idx on public.inventory_movements ("timestamp" desc);
create index if not exists distribution_events_scheduled_date_idx on public.distribution_events (scheduled_date);
create index if not exists distribution_events_status_idx on public.distribution_events (status);
create index if not exists distribution_records_event_id_idx on public.distribution_records (event_id);
create index if not exists incidents_status_idx on public.incidents (status);
create index if not exists incidents_reported_at_idx on public.incidents (reported_at desc);
create index if not exists audit_logs_timestamp_idx on public.audit_logs ("timestamp" desc);
create index if not exists sync_backups_entity_idx on public.sync_backups (entity_type, entity_id, synced_at desc);

create unique index if not exists distribution_records_unique_household_per_event
  on public.distribution_records (event_id, household_id)
  where household_id is not null;

create unique index if not exists distribution_records_unique_resident_per_event
  on public.distribution_records (event_id, resident_id)
  where resident_id is not null;

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
alter table public.incidents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.sync_backups enable row level security;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
on public.users
for select
using (auth.uid() = id or public.is_admin());

drop policy if exists "users_update_admin_only" on public.users;
create policy "users_update_admin_only"
on public.users
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "location_master_lists_read_authenticated" on public.location_master_lists;
create policy "location_master_lists_read_authenticated"
on public.location_master_lists
for select
using (auth.uid() is not null);

drop policy if exists "location_master_lists_write_admin" on public.location_master_lists;
create policy "location_master_lists_write_admin"
on public.location_master_lists
for all
using (public.is_admin())
with check (public.is_admin());

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
using (auth.uid() is not null);

drop policy if exists "programs_write_admin" on public.programs;
create policy "programs_write_admin"
on public.programs
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "beneficiaries_read_authenticated" on public.beneficiaries;
create policy "beneficiaries_read_authenticated"
on public.beneficiaries
for select
using (auth.uid() is not null);

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
using (public.is_admin() or user_id = auth.uid());

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own"
on public.audit_logs
for insert
with check (user_id = auth.uid());

drop policy if exists "sync_backups_select_admin" on public.sync_backups;
create policy "sync_backups_select_admin"
on public.sync_backups
for select
using (public.is_admin());

drop policy if exists "sync_backups_insert_own" on public.sync_backups;
create policy "sync_backups_insert_own"
on public.sync_backups
for insert
with check (synced_by = auth.uid());

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
alter table public.incidents replica identity full;
alter table public.location_master_lists replica identity full;
alter table public.audit_logs replica identity full;
alter table public.sync_backups replica identity full;

do $$
declare
  v_table text;
  v_tables text[] := array[
    'users',
    'location_master_lists',
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
    'incidents',
    'audit_logs',
    'sync_backups'
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
