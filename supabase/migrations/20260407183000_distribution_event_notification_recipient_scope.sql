begin;

create index if not exists households_notification_applicant_user_barangay_idx
  on public.households (applicant_user_id, barangay_id)
  where applicant_user_id is not null;

create index if not exists households_notification_applicant_email_barangay_idx
  on public.households (lower(applicant_email), barangay_id)
  where applicant_email is not null;

create or replace function public.distribution_notification_recipient_user_ids(
  p_barangay_id text
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct users.id
  from public.users as users
  where users.role = 'resident'
    and coalesce(users.status, 'active') = 'active'
    and (
      users.barangay_id = p_barangay_id
      or exists (
        select 1
        from public.households as households
        where households.barangay_id = p_barangay_id
          and coalesce(nullif(trim(households.status), ''), 'active') = 'active'
          and coalesce(nullif(trim(households.registration_status), ''), 'approved') = 'approved'
          and (
            households.applicant_user_id = users.id
            or (
              nullif(trim(coalesce(users.email, '')), '') is not null
              and lower(coalesce(households.applicant_email, '')) = lower(users.email)
            )
          )
      )
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
      select recipients.user_id
      from public.distribution_notification_recipient_user_ids(v_event.barangay_id) as recipients
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
  where users.id in (
    select recipients.user_id
    from public.distribution_notification_recipient_user_ids(v_event.barangay_id) as recipients
  )
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

do $$
declare
  v_event_id text;
begin
  for v_event_id in
    select id
    from public.distribution_events
  loop
    perform public.sync_distribution_event_notifications(v_event_id);
  end loop;
end;
$$;

commit;
