begin;

create table if not exists public.purok_risk_profiles (
  id text primary key,
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

create index if not exists purok_risk_profiles_barangay_id_idx
  on public.purok_risk_profiles (barangay_id);

create unique index if not exists purok_risk_profiles_barangay_purok_idx
  on public.purok_risk_profiles (barangay_id, purok_sitio);

drop trigger if exists purok_risk_profiles_set_updated_at on public.purok_risk_profiles;
create trigger purok_risk_profiles_set_updated_at
before update on public.purok_risk_profiles
for each row
execute function public.set_updated_at();

alter table public.purok_risk_profiles enable row level security;

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

alter table public.purok_risk_profiles replica identity full;

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
      'purok_risk_profile'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purok_risk_profiles'
  ) then
    alter publication supabase_realtime add table public.purok_risk_profiles;
  end if;
end $$;

commit;
