begin;

create table if not exists public.distribution_qr_scan_logs (
  id text primary key default gen_random_uuid()::text,
  event_id text not null references public.distribution_events (id) on delete cascade,
  household_id text references public.households (id) on delete set null,
  claimant_user_id uuid references public.users (id) on delete set null,
  scanned_by uuid references public.users (id) on delete set null,
  source text not null default 'manual'
    check (source in ('camera', 'manual', 'link')),
  status text not null
    check (status in ('resolved', 'rejected', 'released')),
  token_hash text,
  notes text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists distribution_qr_scan_logs_event_id_idx
  on public.distribution_qr_scan_logs (event_id, created_at desc);

create index if not exists distribution_qr_scan_logs_household_id_idx
  on public.distribution_qr_scan_logs (household_id, created_at desc);

alter table public.distribution_qr_scan_logs enable row level security;

drop policy if exists "distribution_qr_scan_logs_staff_access" on public.distribution_qr_scan_logs;
create policy "distribution_qr_scan_logs_staff_access"
on public.distribution_qr_scan_logs
for all
using (coalesce(public.current_user_role(), '') in ('admin', 'encoder'))
with check (coalesce(public.current_user_role(), '') in ('admin', 'encoder'));

alter table public.distribution_qr_scan_logs replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'distribution_qr_scan_logs'
  ) then
    alter publication supabase_realtime add table public.distribution_qr_scan_logs;
  end if;
end;
$$;

commit;
