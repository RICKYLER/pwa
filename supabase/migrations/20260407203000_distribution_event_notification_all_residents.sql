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
  select users.id
  from public.users as users
  where users.role = 'resident'
    and coalesce(users.status, 'active') = 'active';
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
