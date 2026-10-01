begin;

-- =============================================================================
-- Migration: MSWDO Realtime Sync Publication for Cases, Notes, & Attachments
-- 1. Adds soft delete tracking columns to public.cases if not already present.
-- 2. Sets REPLICA IDENTITY FULL on public.cases, public.case_notes, and
--    public.case_attachments so Supabase Realtime delivers entire record payloads.
-- 3. Adds public.cases, public.case_notes, and public.case_attachments to the
--    supabase_realtime publication for instant cross-client synchronization.
-- =============================================================================

-- 1. Add soft delete columns to public.cases if missing
alter table if exists public.cases
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz default null,
  add column if not exists deleted_by text default null;

create index if not exists cases_is_deleted_idx
  on public.cases (is_deleted);

-- 2. Set Full Replica Identity for Complete Realtime Payloads
alter table if exists public.cases replica identity full;
alter table if exists public.case_notes replica identity full;
alter table if exists public.case_attachments replica identity full;

-- 3. Add to Supabase Realtime Publication
do $$
declare
  v_table text;
  v_tables text[] := array['cases', 'case_notes', 'case_attachments'];
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach v_table in array v_tables
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;

commit;
