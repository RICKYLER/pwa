-- Restores the barangay scope of distribution event notifications.
--
-- Migration 20260407203000 replaced distribution_notification_recipient_user_ids()
-- with a definition that ignores p_barangay_id, so every active resident user
-- in every barangay received a notification (and QR access) for every
-- distribution event. This migration reinstates the barangay-scoped definition
-- from 20260407183000, then re-syncs every event. The sync deletes
-- user_notifications rows for users outside the event's barangay, which
-- removes the notifications that were delivered by mistake.

begin;

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
