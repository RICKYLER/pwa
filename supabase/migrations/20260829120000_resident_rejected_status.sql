-- Soft-delete rejected household members
--
-- Previously, rejecting a member that a resident added to their household hard-
-- deleted the resident row. That made the Member Approvals history depend on the
-- REJECT audit log alone (only name/household/reason survived), and meant a
-- rejected member's birthdate, gender, and relationship were lost forever.
--
-- Now rejection marks the row `status = 'rejected'` instead of deleting it, so
-- the row remains as a tombstone the history can read back in full. This
-- migration widens the `residents.status` CHECK constraint to accept the new
-- value. Existing rows are unaffected.

alter table public.residents
  drop constraint if exists residents_status_check;

alter table public.residents
  add constraint residents_status_check
  check (status in ('active', 'moved_out', 'deceased', 'rejected'));
