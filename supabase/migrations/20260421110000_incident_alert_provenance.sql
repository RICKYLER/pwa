alter table public.incidents
  add column if not exists source text;

alter table public.incidents
  drop constraint if exists incidents_source_check;

alter table public.incidents
  add constraint incidents_source_check
  check (source in ('manual', 'alert'));

alter table public.incidents
  add column if not exists source_alert_id text references public.disaster_alerts (id) on delete set null;

alter table public.incidents
  add column if not exists source_rule_id text references public.disaster_alert_rules (id) on delete set null;

alter table public.incidents
  add column if not exists hazard_context text;

alter table public.incidents
  drop constraint if exists incidents_hazard_context_check;

alter table public.incidents
  add constraint incidents_hazard_context_check
  check (hazard_context in ('flood', 'typhoon', 'landslide', 'storm_surge', 'fire', 'earthquake'));

alter table public.incidents
  add column if not exists context_snapshot jsonb;

create index if not exists incidents_source_alert_id_idx on public.incidents (source_alert_id);
