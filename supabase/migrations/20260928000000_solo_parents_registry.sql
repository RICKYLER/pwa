begin;

-- =============================================================================
-- Migration: MSWDO Solo Parents Registry (Republic Act 11861 Compliant)
-- Expanded Solo Parents Welfare Act - Walk-In Desk, ROSP & Benefits Management
-- =============================================================================

-- 1. Create solo_parents table
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

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Indexes for fast search
create index if not exists idx_solo_parents_resident_id on public.solo_parents (resident_id);
create index if not exists idx_solo_parents_household_id on public.solo_parents (household_id);
create index if not exists idx_solo_parents_barangay_id on public.solo_parents (barangay_id);
create index if not exists idx_solo_parents_status on public.solo_parents (status);
create index if not exists idx_solo_parents_id_number on public.solo_parents (id_number);
create index if not exists idx_solo_parents_expires_at on public.solo_parents (expires_at);

-- 3. Extend vulnerability_flags with solo parent columns if not present
alter table public.vulnerability_flags
  add column if not exists is_solo_parent boolean default false,
  add column if not exists solo_parent_id text,
  add column if not exists solo_parent_category text;

-- 4. Update public.users role check constraint to include 'solo_parent_focal'
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'social_worker', 'solo_parent_focal', 'encoder', 'responder', 'resident'));

-- Update handle_auth_user_created trigger function to recognize 'solo_parent_focal'
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
    when coalesce(new.raw_user_meta_data ->> 'role', '') in ('admin', 'social_worker', 'solo_parent_focal', 'encoder', 'responder', 'resident')
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
    status,
    created_at,
    updated_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    v_name,
    v_first_name,
    v_middle_name,
    v_last_name,
    v_role,
    v_barangay_id,
    'active',
    now(),
    now()
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

-- Allow solo_parent_focal to read households in their assigned barangay for walk-in resident matching
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
          public.current_user_role() in ('encoder', 'responder', 'solo_parent_focal')
          and h.barangay_id = public.current_user_barangay_id()
        )
        or (
          public.current_user_role() = 'resident'
          and h.applicant_user_id = auth.uid()
        )
      )
  )
$$;

-- 5. Enable Row Level Security
alter table public.solo_parents enable row level security;

-- Policy: Exclusive access for MSWDO Admin and designated Solo Parent Officers
drop policy if exists "staff_solo_parents_access" on public.solo_parents;
create policy "staff_solo_parents_access"
  on public.solo_parents
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'solo_parent_focal')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'solo_parent_focal')
    )
  );

-- Policy: Residents can view their own record if linked
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

-- 5. Realtime publication
do $$
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'solo_parents'
  ) then
    alter publication supabase_realtime add table public.solo_parents;
  end if;
end $$;

commit;
