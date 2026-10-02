-- Migration: Add voucher_number and source_of_fund to aics_records for manual Petty Cash Voucher encoding
alter table if exists public.aics_records
  add column if not exists voucher_number text,
  add column if not exists source_of_fund text not null default 'DSWD FUNDING';

create index if not exists idx_aics_records_voucher_number on public.aics_records(voucher_number);
