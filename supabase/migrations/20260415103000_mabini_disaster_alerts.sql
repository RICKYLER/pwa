begin;

alter table public.households
  add column if not exists hazard_tags text[] not null default '{}'::text[],
  add column if not exists disaster_risk_level text,
  add column if not exists evacuation_site text,
  add column if not exists special_assistance_notes text,
  add column if not exists disaster_profile_updated_at timestamptz;

alter table public.households
  drop constraint if exists households_disaster_risk_level_check;

alter table public.households
  add constraint households_disaster_risk_level_check
  check (
    disaster_risk_level is null
    or disaster_risk_level in ('low', 'medium', 'high')
  );

alter table public.households
  drop constraint if exists households_hazard_tags_check;

update public.households
set municipality = 'Mabini'
where coalesce(nullif(trim(municipality), ''), '') <> 'Mabini';

create index if not exists households_hazard_tags_idx
  on public.households
  using gin (hazard_tags);

create index if not exists households_disaster_risk_level_idx
  on public.households (disaster_risk_level);

create table if not exists public.disaster_alert_rules (
  id text primary key,
  municipality text not null default 'Mabini',
  barangay_id text not null,
  purok_sitio text,
  hazard text not null
    check (hazard in ('flood', 'typhoon', 'landslide')),
  trigger_lat double precision not null,
  trigger_lng double precision not null,
  enabled boolean not null default true,
  notify_responders boolean not null default true,
  official_keywords text[] not null default '{}'::text[],
  min_rain_chance numeric(8, 2),
  min_rain_intensity_mm_per_hr numeric(8, 2),
  min_next_hour_precip_mm numeric(8, 2),
  min_wind_gust_kph numeric(8, 2),
  cooldown_minutes integer not null default 180
    check (cooldown_minutes >= 30),
  last_triggered_at timestamptz,
  last_trigger_signature text,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  check (municipality = 'Mabini')
);

create table if not exists public.disaster_alerts (
  id text primary key,
  rule_id text not null references public.disaster_alert_rules (id) on delete cascade,
  municipality text not null default 'Mabini',
  barangay_id text not null,
  purok_sitio text,
  hazard text not null
    check (hazard in ('flood', 'typhoon', 'landslide')),
  severity text not null
    check (severity in ('watch', 'warning')),
  title text not null,
  message text not null,
  trigger_source text not null
    check (trigger_source in ('official', 'threshold', 'hybrid')),
  trigger_reason text not null,
  weather_snapshot jsonb not null default '{}'::jsonb,
  evacuation_site text,
  special_assistance_notes text,
  notify_responders boolean not null default true,
  reachable_household_count integer not null default 0,
  unreachable_household_count integer not null default 0,
  issued_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced')),
  check (municipality = 'Mabini'),
  check (jsonb_typeof(weather_snapshot) = 'object'),
  check (reachable_household_count >= 0),
  check (unreachable_household_count >= 0)
);

create index if not exists disaster_alert_rules_barangay_id_idx
  on public.disaster_alert_rules (barangay_id);

create index if not exists disaster_alert_rules_enabled_idx
  on public.disaster_alert_rules (enabled);

create index if not exists disaster_alerts_barangay_issued_at_idx
  on public.disaster_alerts (barangay_id, issued_at desc);

create index if not exists disaster_alerts_rule_id_idx
  on public.disaster_alerts (rule_id);

alter table public.user_notifications
  add column if not exists alert_id text;

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('distribution_event', 'disaster_alert'));

alter table public.user_notifications
  drop constraint if exists user_notifications_alert_id_fkey;

alter table public.user_notifications
  add constraint user_notifications_alert_id_fkey
  foreign key (alert_id)
  references public.disaster_alerts (id)
  on delete cascade;

create index if not exists user_notifications_alert_id_idx
  on public.user_notifications (alert_id);

create unique index if not exists user_notifications_user_type_alert_id_idx
  on public.user_notifications (user_id, type, alert_id)
  where alert_id is not null;

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
      'disaster_alert_rule'
    )
  );

drop trigger if exists disaster_alert_rules_set_updated_at on public.disaster_alert_rules;
create trigger disaster_alert_rules_set_updated_at
before update on public.disaster_alert_rules
for each row
execute function public.set_updated_at();

drop trigger if exists disaster_alerts_set_updated_at on public.disaster_alerts;
create trigger disaster_alerts_set_updated_at
before update on public.disaster_alerts
for each row
execute function public.set_updated_at();

create or replace function public.broadcast_disaster_alert_rule_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    array['role:admin:incidents'],
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_disaster_alert_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    array['role:admin:incidents', 'role:incident_staff:incidents'],
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

drop trigger if exists disaster_alert_rules_broadcast_change on public.disaster_alert_rules;
create trigger disaster_alert_rules_broadcast_change
after insert or update or delete on public.disaster_alert_rules
for each row
execute function public.broadcast_disaster_alert_rule_change();

drop trigger if exists disaster_alerts_broadcast_change on public.disaster_alerts;
create trigger disaster_alerts_broadcast_change
after insert or update or delete on public.disaster_alerts
for each row
execute function public.broadcast_disaster_alert_change();

alter table public.disaster_alert_rules replica identity full;
alter table public.disaster_alerts replica identity full;

commit;
