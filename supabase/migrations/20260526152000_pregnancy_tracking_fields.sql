alter table public.vulnerability_flags
  add column if not exists pregnancy_months integer,
  add column if not exists expected_delivery_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vulnerability_flags_pregnancy_months_check'
      and conrelid = 'public.vulnerability_flags'::regclass
  ) then
    alter table public.vulnerability_flags
      add constraint vulnerability_flags_pregnancy_months_check
      check (pregnancy_months is null or pregnancy_months between 1 and 9);
  end if;
end $$;
