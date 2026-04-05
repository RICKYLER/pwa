alter table public.audit_logs
  alter column user_id drop not null;

alter table public.audit_logs
  drop constraint if exists audit_logs_user_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_user_id_fkey
  foreign key (user_id)
  references public.users (id)
  on delete set null;

alter table public.sync_backups
  alter column synced_by drop not null;

alter table public.sync_backups
  drop constraint if exists sync_backups_synced_by_fkey;

alter table public.sync_backups
  add constraint sync_backups_synced_by_fkey
  foreign key (synced_by)
  references public.users (id)
  on delete set null;
