begin;

create or replace function public.emit_db_change(
  topics text[],
  operation_name text,
  schema_name text,
  table_name text,
  new_record jsonb,
  old_record jsonb
)
returns void
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  topic text;
begin
  foreach topic in array public.array_unique_trimmed(topics)
  loop
    perform realtime.send(
      jsonb_build_object(
        'schema', schema_name,
        'table', table_name,
        'operation', operation_name,
        'record', new_record,
        'old_record', old_record
      ),
      operation_name,
      topic,
      true
    );
  end loop;
end;
$$;

alter table public.distribution_events
  add column if not exists barangay_id text;

update public.distribution_events as distribution_events
set barangay_id = users.barangay_id
from public.users as users
where distribution_events.created_by = users.id
  and coalesce(nullif(trim(distribution_events.barangay_id), ''), '') = '';

alter table public.distribution_events
  alter column barangay_id set not null;

create index if not exists distribution_events_barangay_id_idx
  on public.distribution_events (barangay_id);

create table if not exists public.user_notifications (
  id text primary key default gen_random_uuid()::text,
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('distribution_event')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (jsonb_typeof(payload) = 'object')
);

create index if not exists user_notifications_user_created_at_idx
  on public.user_notifications (user_id, created_at desc);

create index if not exists user_notifications_user_read_at_idx
  on public.user_notifications (user_id, read_at, created_at desc);

drop trigger if exists user_notifications_set_updated_at on public.user_notifications;
create trigger user_notifications_set_updated_at
before update on public.user_notifications
for each row
execute function public.set_updated_at();

create or replace function public.notification_topics_for_user(target_user_id uuid)
returns text[]
language sql
stable
as $$
  select public.array_unique_trimmed(array[
    case
      when target_user_id is not null
        then format('user:%s:notifications', target_user_id::text)
      else null
    end
  ]);
$$;

create or replace function public.broadcast_user_notification_change()
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
    public.array_unique_trimmed(
      public.notification_topics_for_user((new_record ->> 'user_id')::uuid)
      || public.notification_topics_for_user((old_record ->> 'user_id')::uuid)
    ),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

drop trigger if exists user_notifications_broadcast_change on public.user_notifications;
create trigger user_notifications_broadcast_change
after insert or update or delete on public.user_notifications
for each row
execute function public.broadcast_user_notification_change();

alter table public.user_notifications enable row level security;

drop policy if exists "user_notifications_select_own" on public.user_notifications;
create policy "user_notifications_select_own"
on public.user_notifications
for select
using (user_id = auth.uid());

drop policy if exists "user_notifications_update_own" on public.user_notifications;
create policy "user_notifications_update_own"
on public.user_notifications
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

alter table public.user_notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_notifications'
  ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end;
$$;

create or replace function public.create_distribution_event_bundle(
  p_id text,
  p_event_name text,
  p_type text,
  p_target_scope text,
  p_target_group text,
  p_location text,
  p_scheduled_date date,
  p_incident_id text default null,
  p_package_items jsonb default '[]'::jsonb,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_status text default 'planned',
  p_notes text default null,
  p_actor_role text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.distribution_events%rowtype;
  v_actor_barangay_id text;
  v_notification_count integer := 0;
  v_target_label text;
  v_notification_title text;
  v_notification_body text;
  v_notification_payload jsonb;
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to create distribution events.';
  end if;

  if nullif(trim(coalesce(p_id, '')), '') is null then
    raise exception 'Distribution event ID is required.';
  end if;

  if nullif(trim(coalesce(p_event_name, '')), '') is null then
    raise exception 'Event name is required.';
  end if;

  if nullif(trim(coalesce(p_location, '')), '') is null then
    raise exception 'Location is required.';
  end if;

  if p_scheduled_date is null then
    raise exception 'Scheduled date is required.';
  end if;

  if p_type not in ('regular', 'emergency', 'disaster_relief') then
    raise exception 'Unsupported distribution event type.';
  end if;

  if p_target_scope not in ('household', 'resident') then
    raise exception 'Unsupported target scope.';
  end if;

  if p_target_group not in ('all', 'senior', 'pwd', 'pregnant', 'minor', 'low_income') then
    raise exception 'Unsupported target group.';
  end if;

  if coalesce(p_status, 'planned') not in ('planned', 'ongoing', 'completed') then
    raise exception 'Unsupported distribution event status.';
  end if;

  if jsonb_typeof(coalesce(p_package_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Package items must be a JSON array.';
  end if;

  select barangay_id
  into v_actor_barangay_id
  from public.users
  where id = p_actor_user_id;

  if coalesce(nullif(trim(v_actor_barangay_id), ''), '') = '' then
    raise exception 'Authenticated staff barangay could not be resolved.';
  end if;

  insert into public.distribution_events (
    id,
    barangay_id,
    event_name,
    type,
    incident_id,
    target_scope,
    target_group,
    package_items,
    location,
    gps_lat,
    gps_lng,
    scheduled_date,
    status,
    created_by,
    notes,
    sync_status
  )
  values (
    p_id,
    v_actor_barangay_id,
    trim(p_event_name),
    p_type,
    nullif(trim(coalesce(p_incident_id, '')), ''),
    p_target_scope,
    p_target_group,
    coalesce(p_package_items, '[]'::jsonb),
    trim(p_location),
    p_gps_lat,
    p_gps_lng,
    p_scheduled_date,
    coalesce(p_status, 'planned'),
    p_actor_user_id,
    v_notes,
    'synced'
  )
  returning * into v_event;

  v_target_label := case
    when v_event.target_group = 'all' and v_event.target_scope = 'household' then 'All households'
    when v_event.target_group = 'all' and v_event.target_scope = 'resident' then 'All residents'
    when v_event.target_group = 'senior' and v_event.target_scope = 'household' then 'Senior households'
    when v_event.target_group = 'senior' then 'Senior residents'
    when v_event.target_group = 'pwd' and v_event.target_scope = 'household' then 'PWD households'
    when v_event.target_group = 'pwd' then 'PWD residents'
    when v_event.target_group = 'pregnant' and v_event.target_scope = 'household' then 'Pregnant households'
    when v_event.target_group = 'pregnant' then 'Pregnant residents'
    when v_event.target_group = 'minor' and v_event.target_scope = 'household' then 'Minor households'
    when v_event.target_group = 'minor' then 'Minor residents'
    when v_event.target_group = 'low_income' and v_event.target_scope = 'resident' then 'Low income residents'
    when v_event.target_group = 'low_income' then 'Low income households'
    else 'Residents'
  end;

  v_notification_title := trim(v_event.event_name);
  v_notification_body := format(
    '%s distribution scheduled on %s at %s. Audience: %s.',
    initcap(replace(v_event.type, '_', ' ')),
    to_char(v_event.scheduled_date, 'FMMonth DD, YYYY'),
    v_event.location,
    v_target_label
  );

  v_notification_payload := jsonb_build_object(
    'event_id', v_event.id,
    'event_name', v_event.event_name,
    'type', v_event.type,
    'target_scope', v_event.target_scope,
    'target_group', v_event.target_group,
    'scheduled_date', v_event.scheduled_date,
    'location', v_event.location
  );

  if v_notes is not null then
    v_notification_payload := v_notification_payload || jsonb_build_object('notes', v_notes);
  end if;

  insert into public.user_notifications (
    id,
    user_id,
    type,
    title,
    body,
    payload,
    created_at,
    updated_at
  )
  select
    format(
      'notif_%s_%s',
      floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
      substr(md5(gen_random_uuid()::text || users.id::text), 1, 9)
    ),
    users.id,
    'distribution_event',
    v_notification_title,
    v_notification_body,
    v_notification_payload,
    timezone('utc', now()),
    timezone('utc', now())
  from public.users as users
  where users.role = 'resident'
    and coalesce(users.status, 'active') = 'active'
    and users.barangay_id = v_event.barangay_id;

  get diagnostics v_notification_count = row_count;

  return jsonb_build_object(
    'distribution_event', to_jsonb(v_event),
    'distribution_event_id', v_event.id,
    'notification_count', v_notification_count
  );
end;
$$;

create or replace function public.delete_distribution_event_bundle(
  p_event_id text,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.distribution_events%rowtype;
  v_deleted_records jsonb := '[]'::jsonb;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to delete distribution events.';
  end if;

  select *
  into v_event
  from public.distribution_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Distribution event not found.';
  end if;

  with deleted_records as (
    delete from public.distribution_records
    where event_id = p_event_id
    returning to_jsonb(distribution_records.*) as row_data
  )
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into v_deleted_records
  from deleted_records;

  delete from public.user_notifications
  where type = 'distribution_event'
    and payload ->> 'event_id' = p_event_id;

  delete from public.distribution_events
  where id = p_event_id;

  return jsonb_build_object(
    'event_id', p_event_id,
    'deleted_records', v_deleted_records
  );
end;
$$;

drop policy if exists "mswdo_realtime_broadcast_receive" on realtime.messages;
create policy "mswdo_realtime_broadcast_receive"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (select realtime.topic()) = 'global:programs'
    or (
      public.is_admin()
      and (select realtime.topic()) in (
        'role:admin:registry',
        'role:admin:inventory',
        'role:admin:distribution',
        'role:admin:incidents',
        'role:admin:audit'
      )
    )
    or (
      coalesce(public.current_user_role(), '') = 'encoder'
      and (select realtime.topic()) in (
        'role:admin_encoder:inventory',
        'role:admin_encoder:distribution',
        'role:incident_staff:incidents'
      )
    )
    or (
      coalesce(public.current_user_role(), '') in ('health_worker', 'responder')
      and (select realtime.topic()) = 'role:incident_staff:incidents'
    )
    or (
      split_part((select realtime.topic()), ':', 1) = 'barangay'
      and split_part((select realtime.topic()), ':', 2) = coalesce(public.current_user_barangay_id(), '')
      and split_part((select realtime.topic()), ':', 3) = 'registry'
      and coalesce(public.current_user_role(), '') in ('encoder', 'health_worker', 'responder')
    )
    or (
      split_part((select realtime.topic()), ':', 1) = 'user'
      and split_part((select realtime.topic()), ':', 2) = coalesce(auth.uid()::text, '')
      and split_part((select realtime.topic()), ':', 3) in ('registry', 'audit', 'notifications')
    )
  )
);

commit;
