begin;

alter table public.user_notifications
  add column if not exists event_id text;

update public.user_notifications as notifications
set event_id = candidate.event_id
from (
  select
    user_notifications.id,
    nullif(trim(user_notifications.payload ->> 'event_id'), '') as event_id
  from public.user_notifications
  where user_notifications.type = 'distribution_event'
) as candidate
where notifications.id = candidate.id
  and notifications.event_id is null
  and candidate.event_id is not null
  and exists (
    select 1
    from public.distribution_events
    where id = candidate.event_id
  );

with ranked_notifications as (
  select
    id,
    row_number() over (
      partition by user_id, type, event_id
      order by updated_at desc, created_at desc, id desc
    ) as row_number
  from public.user_notifications
  where event_id is not null
)
delete from public.user_notifications
where id in (
  select id
  from ranked_notifications
  where row_number > 1
);

alter table public.user_notifications
  drop constraint if exists user_notifications_event_id_fkey;

alter table public.user_notifications
  add constraint user_notifications_event_id_fkey
  foreign key (event_id)
  references public.distribution_events (id)
  on delete cascade;

create index if not exists user_notifications_event_id_idx
  on public.user_notifications (event_id);

create unique index if not exists user_notifications_user_type_event_id_idx
  on public.user_notifications (user_id, type, event_id);

create or replace function public.build_distribution_notification_audience_label(
  p_target_scope text,
  p_target_group text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_target_group, 'all') = 'all'
      then case
        when p_target_scope = 'resident' then 'All residents'
        else 'All households'
      end
    when p_target_group = 'senior'
      then case when p_target_scope = 'resident' then 'Senior residents' else 'Senior households' end
    when p_target_group = 'pwd'
      then case when p_target_scope = 'resident' then 'PWD residents' else 'PWD households' end
    when p_target_group = 'pregnant'
      then case when p_target_scope = 'resident' then 'Pregnant residents' else 'Pregnant households' end
    when p_target_group = 'minor'
      then case when p_target_scope = 'resident' then 'Minor residents' else 'Minor households' end
    when p_target_group = 'low_income'
      then case when p_target_scope = 'resident' then 'Low income residents' else 'Low income households' end
    else case
      when p_target_scope = 'resident' then 'Residents'
      else 'Households'
    end
  end;
$$;

create or replace function public.build_distribution_notification_body(
  p_type text,
  p_status text,
  p_scheduled_date date,
  p_location text,
  p_target_scope text,
  p_target_group text
)
returns text
language sql
immutable
as $$
  select format(
    '%s distribution status: %s. Schedule: %s. Location: %s. Audience: %s.',
    initcap(replace(coalesce(nullif(trim(p_type), ''), 'distribution'), '_', ' ')),
    case coalesce(p_status, 'planned')
      when 'ongoing' then 'Ongoing'
      when 'completed' then 'Completed'
      else 'Planned'
    end,
    coalesce(to_char(p_scheduled_date, 'FMMonth DD, YYYY'), 'To be announced'),
    coalesce(nullif(trim(p_location), ''), 'the barangay venue'),
    public.build_distribution_notification_audience_label(p_target_scope, p_target_group)
  );
$$;

create or replace function public.sync_distribution_event_notifications(
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
  v_notification_count integer := 0;
  v_notification_body text;
  v_notification_payload jsonb;
begin
  if nullif(trim(coalesce(p_event_id, '')), '') is null then
    raise exception 'Distribution event ID is required.';
  end if;

  if p_actor_role is not null and coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to sync distribution notifications.';
  end if;

  select *
  into v_event
  from public.distribution_events
  where id = p_event_id;

  if not found then
    delete from public.user_notifications
    where type = 'distribution_event'
      and event_id = p_event_id;

    get diagnostics v_notification_count = row_count;

    return jsonb_build_object(
      'distribution_event_id', p_event_id,
      'notification_count', v_notification_count
    );
  end if;

  v_notification_body := public.build_distribution_notification_body(
    v_event.type,
    v_event.status,
    v_event.scheduled_date,
    v_event.location,
    v_event.target_scope,
    v_event.target_group
  );

  v_notification_payload := jsonb_build_object(
    'event_id', v_event.id,
    'event_name', v_event.event_name,
    'type', v_event.type,
    'status', v_event.status,
    'target_scope', v_event.target_scope,
    'target_group', v_event.target_group,
    'scheduled_date', v_event.scheduled_date,
    'location', v_event.location
  );

  if nullif(trim(coalesce(v_event.notes, '')), '') is not null then
    v_notification_payload := v_notification_payload || jsonb_build_object('notes', trim(v_event.notes));
  end if;

  delete from public.user_notifications
  where type = 'distribution_event'
    and event_id = v_event.id
    and user_id not in (
      select users.id
      from public.users as users
      where users.role = 'resident'
        and coalesce(users.status, 'active') = 'active'
        and users.barangay_id = v_event.barangay_id
    );

  insert into public.user_notifications (
    id,
    user_id,
    event_id,
    type,
    title,
    body,
    payload,
    read_at,
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
    v_event.id,
    'distribution_event',
    trim(v_event.event_name),
    v_notification_body,
    v_notification_payload,
    case
      when existing.id is null then null
      when existing.title is distinct from trim(v_event.event_name)
        or existing.body is distinct from v_notification_body
        or existing.payload is distinct from v_notification_payload
      then null
      else existing.read_at
    end,
    coalesce(existing.created_at, timezone('utc', now())),
    timezone('utc', now())
  from public.users as users
  left join public.user_notifications as existing
    on existing.user_id = users.id
    and existing.type = 'distribution_event'
    and existing.event_id = v_event.id
  where users.role = 'resident'
    and coalesce(users.status, 'active') = 'active'
    and users.barangay_id = v_event.barangay_id
  on conflict (user_id, type, event_id) do update
  set
    title = excluded.title,
    body = excluded.body,
    payload = excluded.payload,
    read_at = case
      when public.user_notifications.title is distinct from excluded.title
        or public.user_notifications.body is distinct from excluded.body
        or public.user_notifications.payload is distinct from excluded.payload
      then null
      else public.user_notifications.read_at
    end,
    updated_at = timezone('utc', now());

  get diagnostics v_notification_count = row_count;

  return jsonb_build_object(
    'distribution_event_id', v_event.id,
    'notification_count', v_notification_count,
    'distribution_event', to_jsonb(v_event)
  );
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
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_sync_result jsonb := '{}'::jsonb;
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

  v_sync_result := public.sync_distribution_event_notifications(v_event.id, p_actor_role);

  return v_sync_result || jsonb_build_object(
    'distribution_event', to_jsonb(v_event),
    'distribution_event_id', v_event.id
  );
end;
$$;

create or replace function public.update_distribution_event_bundle(
  p_event_id text,
  p_updates jsonb default '{}'::jsonb,
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
  v_sync_result jsonb := '{}'::jsonb;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to update distribution events.';
  end if;

  if nullif(trim(coalesce(p_event_id, '')), '') is null then
    raise exception 'Distribution event ID is required.';
  end if;

  if jsonb_typeof(coalesce(p_updates, '{}'::jsonb)) <> 'object' then
    raise exception 'Distribution event updates must be a JSON object.';
  end if;

  if p_updates ? 'event_name' and nullif(trim(coalesce(p_updates ->> 'event_name', '')), '') is null then
    raise exception 'Event name is required.';
  end if;

  if p_updates ? 'location' and nullif(trim(coalesce(p_updates ->> 'location', '')), '') is null then
    raise exception 'Location is required.';
  end if;

  if p_updates ? 'type' and (p_updates ->> 'type') not in ('regular', 'emergency', 'disaster_relief') then
    raise exception 'Unsupported distribution event type.';
  end if;

  if p_updates ? 'target_scope' and (p_updates ->> 'target_scope') not in ('household', 'resident') then
    raise exception 'Unsupported target scope.';
  end if;

  if p_updates ? 'target_group' and (p_updates ->> 'target_group') not in ('all', 'senior', 'pwd', 'pregnant', 'minor', 'low_income') then
    raise exception 'Unsupported target group.';
  end if;

  if p_updates ? 'status' and (p_updates ->> 'status') not in ('planned', 'ongoing', 'completed') then
    raise exception 'Unsupported distribution event status.';
  end if;

  if p_updates ? 'package_items' and jsonb_typeof(coalesce(p_updates -> 'package_items', '[]'::jsonb)) <> 'array' then
    raise exception 'Package items must be a JSON array.';
  end if;

  if p_updates ? 'scheduled_date' and nullif(trim(coalesce(p_updates ->> 'scheduled_date', '')), '') is null then
    raise exception 'Scheduled date is required.';
  end if;

  update public.distribution_events
  set
    event_name = case
      when p_updates ? 'event_name' then trim(p_updates ->> 'event_name')
      else event_name
    end,
    type = case
      when p_updates ? 'type' then p_updates ->> 'type'
      else type
    end,
    incident_id = case
      when p_updates ? 'incident_id' then nullif(trim(coalesce(p_updates ->> 'incident_id', '')), '')
      else incident_id
    end,
    target_scope = case
      when p_updates ? 'target_scope' then p_updates ->> 'target_scope'
      else target_scope
    end,
    target_group = case
      when p_updates ? 'target_group' then p_updates ->> 'target_group'
      else target_group
    end,
    package_items = case
      when p_updates ? 'package_items' then coalesce(p_updates -> 'package_items', '[]'::jsonb)
      else package_items
    end,
    location = case
      when p_updates ? 'location' then trim(p_updates ->> 'location')
      else location
    end,
    gps_lat = case
      when p_updates ? 'gps_lat' then nullif(p_updates ->> 'gps_lat', '')::double precision
      else gps_lat
    end,
    gps_lng = case
      when p_updates ? 'gps_lng' then nullif(p_updates ->> 'gps_lng', '')::double precision
      else gps_lng
    end,
    scheduled_date = case
      when p_updates ? 'scheduled_date' then (p_updates ->> 'scheduled_date')::date
      else scheduled_date
    end,
    status = case
      when p_updates ? 'status' then p_updates ->> 'status'
      else status
    end,
    notes = case
      when p_updates ? 'notes' then nullif(trim(coalesce(p_updates ->> 'notes', '')), '')
      else notes
    end,
    sync_status = 'synced'
  where id = p_event_id
  returning * into v_event;

  if not found then
    raise exception 'Distribution event not found.';
  end if;

  v_sync_result := public.sync_distribution_event_notifications(v_event.id, p_actor_role);

  return v_sync_result || jsonb_build_object(
    'distribution_event', to_jsonb(v_event),
    'distribution_event_id', v_event.id
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
    and (
      event_id = p_event_id
      or payload ->> 'event_id' = p_event_id
    );

  delete from public.distribution_events
  where id = p_event_id;

  return jsonb_build_object(
    'event_id', p_event_id,
    'deleted_records', v_deleted_records
  );
end;
$$;

do $$
declare
  v_event_id text;
begin
  for v_event_id in
    select distinct user_notifications.event_id
    from public.user_notifications
    where user_notifications.type = 'distribution_event'
      and user_notifications.event_id is not null
  loop
    perform public.sync_distribution_event_notifications(v_event_id);
  end loop;
end;
$$;

commit;
