begin;

-- =============================================================================
-- Migration: MSWDO Assistance to Individuals in Crisis Situations (AICS) Desk
-- Comprehensive Intake, Client Categorization (FHONA, SC, PWD, YNSP),
-- General Intake Sheet (GIS) Records & Disbursement Management
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Update public.users role check constraint to include 'aics_focal'
-- -----------------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'social_worker', 'solo_parent_focal', 'aics_focal', 'encoder', 'health_worker', 'responder', 'resident'));

-- Update handle_auth_user_created trigger function to recognize 'aics_focal'
create or replace function public.handle_auth_user_created()
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
    when coalesce(new.raw_user_meta_data ->> 'role', '') in (
      'admin', 'social_worker', 'solo_parent_focal', 'aics_focal', 'encoder', 'health_worker', 'responder', 'resident'
    )
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
    status,
    barangay_id,
    must_change_password,
    email_verification_required,
    email_verified_at,
    created_at,
    updated_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    v_name,
    coalesce(v_first_name, v_name),
    coalesce(v_middle_name, ''),
    coalesce(v_last_name, ''),
    v_role,
    'active',
    v_barangay_id,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'email_verification_required')::boolean, false),
    case
      when coalesce((new.raw_user_meta_data ->> 'email_verification_required')::boolean, false) then null
      else timezone('utc', now())
    end,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    first_name = coalesce(excluded.first_name, public.users.first_name),
    middle_name = coalesce(excluded.middle_name, public.users.middle_name),
    last_name = coalesce(excluded.last_name, public.users.last_name),
    role = excluded.role,
    barangay_id = excluded.barangay_id,
    status = coalesce(public.users.status, 'active'),
    updated_at = now();

  return new;
end;
$$;

-- Allow aics_focal and solo_parent_focal to read households in their assigned barangay for walk-in resident matching
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
          public.current_user_role() in ('encoder', 'health_worker', 'responder', 'solo_parent_focal', 'aics_focal')
          and h.barangay_id = public.current_user_barangay_id()
        )
        or (
          public.current_user_role() = 'resident'
          and h.applicant_user_id = auth.uid()
        )
      )
  )
$$;

-- -----------------------------------------------------------------------------
-- 2. Create public.aics_records Table
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

-- Trigger to maintain updated_at
drop trigger if exists set_aics_records_updated_at on public.aics_records;
create trigger set_aics_records_updated_at
  before update on public.aics_records
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Indexes for fast query and reporting
-- -----------------------------------------------------------------------------
create index if not exists idx_aics_records_control_number on public.aics_records (control_number);
create index if not exists idx_aics_records_resident_id on public.aics_records (resident_id);
create index if not exists idx_aics_records_household_id on public.aics_records (household_id);
create index if not exists idx_aics_records_barangay_id on public.aics_records (barangay_id);
create index if not exists idx_aics_records_client_category on public.aics_records (client_category);
create index if not exists idx_aics_records_assistance_type on public.aics_records (assistance_type);
create index if not exists idx_aics_records_status on public.aics_records (status);
create index if not exists idx_aics_records_intake_date on public.aics_records (intake_date desc);
create index if not exists idx_aics_records_is_deleted on public.aics_records (is_deleted);

-- -----------------------------------------------------------------------------
-- 4. Enable Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.aics_records enable row level security;

-- Policy: Exclusive read/write access for MSWDO Admin and designated AICS Focal Officers
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

-- Policy: Residents can view their own crisis assistance history if linked
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
-- 5. Realtime Publication
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'aics_records'
  ) then
    alter publication supabase_realtime add table public.aics_records;
  end if;
end $$;

commit;
