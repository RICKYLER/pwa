begin;

-- =============================================================================
-- Migration: Evacuee Check-in Records (Disaster Evacuation Management)
-- Links Master Evac QR Scans / Households to Designated Evacuation Centers
-- =============================================================================

create table if not exists public.evacuee_checkins (
  id text primary key,
  household_id text not null references public.households (id) on delete cascade,
  head_name text not null,
  evacuation_center_id text not null references public.evacuation_centers (id) on delete cascade,
  evacuation_center_name text not null,
  barangay_id text not null,
  barangay_name text not null default 'Cuambog',
  purok_sitio text not null,
  family_members_count integer not null default 1 check (family_members_count >= 1),
  contact_number text,
  vulnerabilities jsonb not null default '{"seniors":0,"infants":0,"pwds":0,"pregnant":0,"children":0}'::jsonb,
  checked_in_at timestamptz not null default timezone('utc', now()),
  checked_in_by text,
  status text not null default 'sheltered' check (status in ('sheltered', 'checked_out')),
  checked_out_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Indexes for lightning-fast lookups during disaster response
create index if not exists evacuee_checkins_household_id_idx
  on public.evacuee_checkins (household_id);

create index if not exists evacuee_checkins_evac_center_id_idx
  on public.evacuee_checkins (evacuation_center_id);

create index if not exists evacuee_checkins_status_idx
  on public.evacuee_checkins (status);

create index if not exists evacuee_checkins_barangay_id_idx
  on public.evacuee_checkins (barangay_id);

-- Row Level Security (RLS)
alter table public.evacuee_checkins enable row level security;

-- Policies:
-- 1. Authenticated users (Admin, MDRRMO, Responders, Health Workers) can view evacuee lists
create policy "evacuee_checkins_read_staff"
on public.evacuee_checkins
for select
using (
  public.current_user_is_active()
);

-- 2. Staff and responders can insert / check-in households
create policy "evacuee_checkins_write_staff"
on public.evacuee_checkins
for all
using (
  public.current_user_is_active()
  and (
    public.is_admin()
    or public.current_user_role() in ('responder', 'encoder', 'health_worker')
  )
)
with check (
  public.current_user_is_active()
  and (
    public.is_admin()
    or public.current_user_role() in ('responder', 'encoder', 'health_worker')
  )
);

commit;
