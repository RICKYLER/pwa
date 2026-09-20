begin;

create table if not exists public.forecasting_dataset_uploads (
  id text primary key,
  file_name text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  compressed_size_bytes bigint not null check (compressed_size_bytes >= 0),
  file_type text not null check (file_type in ('xlsx', 'xls', 'csv')),
  storage_path text,
  records_count integer not null default 0 check (records_count >= 0),
  accuracy_rate numeric(5, 2) not null default 0,
  mape_percent numeric(5, 2) not null default 0,
  mae_error numeric(8, 2) not null default 0,
  uploaded_by text not null default 'MSWDO Staff',
  uploaded_at timestamptz not null default timezone('utc', now()),
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  dataset_events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists forecasting_dataset_uploads_uploaded_at_idx
  on public.forecasting_dataset_uploads (uploaded_at desc);

create index if not exists forecasting_dataset_uploads_is_active_idx
  on public.forecasting_dataset_uploads (is_active);

alter table public.forecasting_dataset_uploads enable row level security;

drop policy if exists "forecasting_dataset_uploads_read" on public.forecasting_dataset_uploads;
create policy "forecasting_dataset_uploads_read"
on public.forecasting_dataset_uploads
for select
using (
  public.current_user_is_active()
  or auth.role() = 'authenticated'
);

drop policy if exists "forecasting_dataset_uploads_write" on public.forecasting_dataset_uploads;
create policy "forecasting_dataset_uploads_write"
on public.forecasting_dataset_uploads
for all
using (
  public.current_user_is_active()
  or auth.role() = 'authenticated'
)
with check (
  public.current_user_is_active()
  or auth.role() = 'authenticated'
);

commit;
