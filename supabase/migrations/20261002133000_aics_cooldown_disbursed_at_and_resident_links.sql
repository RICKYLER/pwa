begin;

-- =============================================================================
-- Migration: Add AICS Cooldown Tracking, Disbursed Timestamp, & Census Resident Links
-- Supports 3-Month (90-day) AICS cooldown validation, disbursement timestamping,
-- and links to active residents & households for automated client profile history.
-- =============================================================================

-- 1. Ensure disbursed_at column exists on public.aics_records
alter table public.aics_records
  add column if not exists disbursed_at timestamptz;

-- 2. Ensure foreign keys to residents and households exist
alter table public.aics_records
  add column if not exists resident_id text references public.residents(id) on delete set null;

alter table public.aics_records
  add column if not exists household_id text references public.households(id) on delete set null;

-- 3. Create performance indexes for cooldown tracking & fast resident lookup
create index if not exists idx_aics_records_disbursed_at
  on public.aics_records (disbursed_at desc);

create index if not exists idx_aics_records_resident_cooldown
  on public.aics_records (resident_id, status, disbursed_at desc);

create index if not exists idx_aics_records_household_cooldown
  on public.aics_records (household_id, status, disbursed_at desc);

create index if not exists idx_aics_records_client_name
  on public.aics_records (client_name);

-- 4. Update residents view policy so verified household members / residents can view their AICS claim history
drop policy if exists "residents_view_own_aics_records" on public.aics_records;

create policy "residents_view_own_aics_records"
  on public.aics_records
  for select
  using (
    public.is_admin()
    or public.current_user_role() in ('social_worker', 'aics_focal', 'encoder')
    or exists (
      select 1
      from public.residents r
      left join public.households h on h.id = r.household_id
      where (r.id = aics_records.resident_id or h.id = aics_records.household_id)
        and h.applicant_user_id = auth.uid()
    )
  );

commit;
