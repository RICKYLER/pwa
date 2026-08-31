-- Member approval notifications
--
-- Residents can add new members to their own household; those members land as
-- `pending` and an admin reviews them from the Member Approvals queue. When an
-- admin rejects a member the resident is notified in-app via `user_notifications`
-- with a new `member_approval` type. The `type` column has a closed CHECK
-- constraint, so widen it to allow the new value.
--
-- The reject flow inserts this notification best-effort (it logs and continues on
-- failure), so rejecting a member works with or without this migration applied;
-- applying it simply lights up the in-app "not approved" notice for residents.

alter table public.user_notifications
  drop constraint if exists user_notifications_type_check;

alter table public.user_notifications
  add constraint user_notifications_type_check
  check (type in ('distribution_event', 'disaster_alert', 'member_approval'));
