begin;

-- =============================================================================
-- Migration: AICS Daily Assistance Fund Budgets & Supabase Realtime Publication
-- Enables live multi-device synchronization for AICS Records and Daily Fund Budgets
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Create public.aics_daily_budgets Table
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

-- Trigger to maintain updated_at
drop trigger if exists set_aics_daily_budgets_updated_at on public.aics_daily_budgets;
create trigger set_aics_daily_budgets_updated_at
  before update on public.aics_daily_budgets
  for each row
  execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Indexes for fast date lookup and ordering
-- -----------------------------------------------------------------------------
create index if not exists idx_aics_daily_budgets_date on public.aics_daily_budgets (date desc);

-- -----------------------------------------------------------------------------
-- 3. Row Level Security (RLS)
-- -----------------------------------------------------------------------------
alter table public.aics_daily_budgets enable row level security;

-- Policy: Admin and AICS Focal Officers can create, update, or read daily budgets
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

-- Policy: Authenticated users can view daily budget balance (for intake quota display)
drop policy if exists "authenticated_read_aics_daily_budgets" on public.aics_daily_budgets;
create policy "authenticated_read_aics_daily_budgets"
  on public.aics_daily_budgets
  for select
  using (auth.uid() is not null);

-- -----------------------------------------------------------------------------
-- 4. Update public.audit_logs entity_type constraint for AICS and Cases
-- -----------------------------------------------------------------------------
alter table public.audit_logs drop constraint if exists audit_logs_entity_type_check;

alter table public.audit_logs
  add constraint audit_logs_entity_type_check
  check (entity_type in (
    'household', 'resident', 'distribution', 'incident', 'inventory',
    'user', 'location_master', 'disaster_alert', 'disaster_alert_rule',
    'purok_risk_profile', 'evacuation_center', 'case', 'aics_record', 'aics_daily_budget'
  ));

-- -----------------------------------------------------------------------------
-- 5. Set Full Replica Identity for Complete Realtime Payloads
-- -----------------------------------------------------------------------------
alter table if exists public.aics_records replica identity full;
alter table public.aics_daily_budgets replica identity full;

-- -----------------------------------------------------------------------------
-- 6. Add to Supabase Realtime Publication
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_tables text[] := array['aics_records', 'aics_daily_budgets'];
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach v_table in array v_tables
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;

commit;
