begin;

lock table
  public.users,
  public.location_master_lists,
  public.programs,
  public.beneficiaries,
  public.audit_logs,
  public.sync_backups
in access exclusive mode;

alter table public.users
  add column if not exists status text not null default 'active';

update public.users
set status = 'active'
where status is null;

alter table public.users
  drop constraint if exists users_status_check;

alter table public.users
  add constraint users_status_check
  check (status in ('active', 'inactive'));

create index if not exists users_status_idx
  on public.users (status);

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.status = 'active'
  )
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role
  from public.users u
  where u.id = auth.uid()
    and u.status = 'active'
$$;

create or replace function public.current_user_barangay_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.barangay_id
  from public.users u
  where u.id = auth.uid()
    and u.status = 'active'
$$;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.email
  from public.users u
  where u.id = auth.uid()
    and u.status = 'active'
$$;

drop policy if exists "users_select_self_or_admin" on public.users;
create policy "users_select_self_or_admin"
on public.users
for select
using (public.current_user_is_active() and (auth.uid() = id or public.is_admin()));

drop policy if exists "location_master_lists_read_authenticated" on public.location_master_lists;
drop policy if exists "location_master_lists_read_scoped" on public.location_master_lists;
create policy "location_master_lists_read_scoped"
on public.location_master_lists
for select
using (
  public.current_user_is_active()
  and (
    public.is_admin()
    or barangay_id = public.current_user_barangay_id()
  )
);

drop policy if exists "programs_read_authenticated" on public.programs;
create policy "programs_read_authenticated"
on public.programs
for select
using (public.current_user_is_active());

drop policy if exists "beneficiaries_read_authenticated" on public.beneficiaries;
drop policy if exists "beneficiaries_read_scoped" on public.beneficiaries;
create policy "beneficiaries_read_scoped"
on public.beneficiaries
for select
using (public.current_user_is_active() and public.can_access_beneficiary(id));

drop policy if exists "audit_logs_select_self_or_admin" on public.audit_logs;
create policy "audit_logs_select_self_or_admin"
on public.audit_logs
for select
using (public.current_user_is_active() and (public.is_admin() or user_id = auth.uid()));

drop policy if exists "audit_logs_insert_own" on public.audit_logs;
create policy "audit_logs_insert_own"
on public.audit_logs
for insert
with check (public.current_user_is_active() and user_id = auth.uid());

drop policy if exists "sync_backups_insert_own" on public.sync_backups;
create policy "sync_backups_insert_own"
on public.sync_backups
for insert
with check (public.current_user_is_active() and synced_by = auth.uid());

commit;
