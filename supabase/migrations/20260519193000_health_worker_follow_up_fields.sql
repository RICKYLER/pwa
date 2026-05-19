alter table public.vulnerability_flags
  add column if not exists follow_up_status text not null default 'none',
  add column if not exists medical_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vulnerability_flags_follow_up_status_check'
      and conrelid = 'public.vulnerability_flags'::regclass
  ) then
    alter table public.vulnerability_flags
      add constraint vulnerability_flags_follow_up_status_check
      check (follow_up_status in ('none', 'needs_visit', 'visited', 'referred', 'resolved'));
  end if;
end $$;
