begin;

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

create index if not exists evacuation_centers_barangay_id_idx
  on public.evacuation_centers (barangay_id);

create index if not exists evacuation_centers_status_idx
  on public.evacuation_centers (status);

create unique index if not exists evacuation_centers_barangay_name_idx
  on public.evacuation_centers (barangay_id, lower(trim(name)));

drop trigger if exists evacuation_centers_set_updated_at on public.evacuation_centers;
create trigger evacuation_centers_set_updated_at
before update on public.evacuation_centers
for each row
execute function public.set_updated_at();

alter table public.evacuation_centers enable row level security;

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

-- Responders can open/close centers in their own barangay (manual override),
-- but only the registry fields guarded above stay admin-managed.
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

alter table public.evacuation_centers replica identity full;

alter table public.audit_logs
  drop constraint if exists audit_logs_entity_type_check;

alter table public.audit_logs
  add constraint audit_logs_entity_type_check
  check (
    entity_type in (
      'household',
      'resident',
      'distribution',
      'incident',
      'inventory',
      'user',
      'location_master',
      'disaster_alert',
      'disaster_alert_rule',
      'purok_risk_profile',
      'evacuation_center'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'evacuation_centers'
  ) then
    alter publication supabase_realtime add table public.evacuation_centers;
  end if;
end $$;

commit;
