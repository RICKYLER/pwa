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

-- 4. Enable Row Level Security
alter table public.solo_parents enable row level security;

-- Policy: MSWDO Staff (Admin, Social Worker, Encoder) have full access
drop policy if exists "staff_solo_parents_access" on public.solo_parents;
create policy "staff_solo_parents_access"
  on public.solo_parents
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'social_worker', 'encoder')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'social_worker', 'encoder')
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
