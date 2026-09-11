-- Differentiates distribution event notifications by claim state when an
-- event is completed. Previously every recipient got the same generic body,
-- so a resident whose household never received a package saw the same
-- "Completed" message as one who claimed. Now:
--
--   * released users  -> generic body, payload.claim_status = 'released'
--   * audience users without a record -> body gains a follow-up sentence and
--     payload.claim_status = 'unclaimed' (only for grouped events when the
--     user's household actually matches the target group)
--   * everyone else   -> generic body, no claim_status
--
-- The recipient scope, delete-out-of-scope behavior, and the read_at
-- reset-on-change semantics of 20260407183000 / 20260901090000 are preserved;
-- only the per-user body and payload change.

begin;

drop function if exists public.build_distribution_notification_body(text, text, date, text, text, text);

create or replace function public.build_distribution_notification_body(
  p_type text,
  p_status text,
  p_scheduled_date date,
  p_location text,
  p_target_scope text,
  p_target_group text,
  p_claim_status text default null
)
returns text
language sql
immutable
as $$
  select format(
    '%s distribution status: %s. Schedule: %s. Location: %s. Audience: %s.%s',
    initcap(replace(coalesce(nullif(trim(p_type), ''), 'distribution'), '_', ' ')),
    case coalesce(p_status, 'planned')
      when 'ongoing' then 'Ongoing'
      when 'completed' then 'Completed'
      else 'Planned'
    end,
    coalesce(to_char(p_scheduled_date, 'FMMonth DD, YYYY'), 'To be announced'),
    coalesce(nullif(trim(p_location), ''), 'the barangay venue'),
    public.build_distribution_notification_audience_label(p_target_scope, p_target_group),
    case coalesce(p_claim_status, '')
      when 'unclaimed'
        then ' This event has ended, but your household was not able to claim. Contact the barangay for follow-up.'
      else ''
    end
  );
$$;

-- Per-user claim state for a completed event. Households are linked to the
-- user the same way distribution_notification_recipient_user_ids() links
-- them: applicant_user_id, or a case-insensitive applicant_email match.
create or replace function public.distribution_notification_user_claim_state(
  p_event_id text,
  p_user_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.distribution_events%rowtype;
  v_email text;
  v_served boolean;
  v_audience boolean;
begin
  if p_user_id is null or nullif(trim(coalesce(p_event_id, '')), '') is null then
    return null;
  end if;

  select *
  into v_event
  from public.distribution_events
  where id = p_event_id;

  if not found or v_event.status <> 'completed' then
    return null;
  end if;

  select lower(coalesce(email, ''))
  into v_email
  from public.users
  where id = p_user_id;

  -- Served: any household linked to this user received a package for the
  -- event, either released directly to the household or through a resident
  -- member record.
  select exists (
    select 1
    from public.distribution_records dr
    join public.households h on h.id = dr.household_id
    where dr.event_id = v_event.id
      and dr.household_id is not null
      and (
        h.applicant_user_id = p_user_id
        or (
          nullif(trim(coalesce(v_email, '')), '') <> ''
          and lower(coalesce(h.applicant_email, '')) = v_email
        )
      )
  ) or exists (
    select 1
    from public.distribution_records dr
    join public.residents r on r.id = dr.resident_id
    join public.households h on h.id = r.household_id
    where dr.event_id = v_event.id
      and dr.resident_id is not null
      and (
        h.applicant_user_id = p_user_id
        or (
          nullif(trim(coalesce(v_email, '')), '') <> ''
          and lower(coalesce(h.applicant_email, '')) = v_email
        )
      )
  )
  into v_served;

  if v_served then
    return 'released';
  end if;

  -- Only tell users they were "not able to claim" when their household is
  -- actually part of the configured audience. The conditions mirror
  -- matchesDistributionTargetGroup() in lib/distribution-audience.ts:
  -- vulnerability flags (with birthdate-derived age for senior/minor) or a
  -- low income level. Everything else keeps the generic completed body.
  select exists (
    select 1
    from public.households h
    join public.residents r on r.household_id = h.id
    left join public.vulnerability_flags vf on vf.resident_id = r.id
    where (
        h.applicant_user_id = p_user_id
        or (
          nullif(trim(coalesce(v_email, '')), '') <> ''
          and lower(coalesce(h.applicant_email, '')) = v_email
        )
      )
      and coalesce(nullif(trim(h.status), ''), 'active') = 'active'
      and coalesce(nullif(trim(h.registration_status), ''), 'approved') = 'approved'
      and coalesce(r.status, 'active') = 'active'
      and (
        v_event.target_group = 'all'
        or (
          v_event.target_group = 'senior'
          and (
            coalesce(vf.is_senior, false)
            or (
              r.birthdate is not null
              and r.birthdate <= (current_date - interval '60 years')::date
            )
          )
        )
        or (v_event.target_group = 'pwd' and coalesce(vf.is_pwd, false))
        or (v_event.target_group = 'pregnant' and coalesce(vf.is_pregnant, false))
        or (
          v_event.target_group = 'minor'
          and (
            coalesce(vf.is_child, false)
            or (
              r.birthdate is not null
              and r.birthdate > (current_date - interval '18 years')::date
            )
          )
        )
        or (
          v_event.target_group = 'low_income'
          and (coalesce(vf.is_low_income, false) or r.income_level = 'low')
        )
      )
  )
  into v_audience;

  if v_audience then
    return 'unclaimed';
  end if;

  return null;
end;
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
  v_unclaimed_body text;
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

  v_unclaimed_body := public.build_distribution_notification_body(
    v_event.type,
    v_event.status,
    v_event.scheduled_date,
    v_event.location,
    v_event.target_scope,
    v_event.target_group,
    'unclaimed'
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
    content.body,
    content.payload,
    case
      when existing.id is null then null
      when existing.title is distinct from trim(v_event.event_name)
        or existing.body is distinct from content.body
        or existing.payload is distinct from content.payload
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
  cross join lateral (
    select public.distribution_notification_user_claim_state(v_event.id, users.id) as claim_status
  ) as claim_state
  cross join lateral (
    select
      case
        when claim_state.claim_status = 'unclaimed' then v_unclaimed_body
        else v_notification_body
      end as body,
      v_notification_payload || case claim_state.claim_status
        when 'unclaimed' then jsonb_build_object('claim_status', 'unclaimed')
        when 'released' then jsonb_build_object('claim_status', 'released')
        else '{}'::jsonb
      end as payload
  ) as content
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

-- Re-sync every event so already-completed partial events immediately get
-- the differentiated bodies and payload claim states.
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
