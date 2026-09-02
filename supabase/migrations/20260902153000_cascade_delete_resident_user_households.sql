begin;

-- Automatically hard-delete any households, QR scan logs, and tokens registered
-- by a user when that user account is deleted from public.users or auth.users.
create or replace function public.handle_user_account_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_household_ids text[];
  v_resident_ids text[];
  v_vulnerability_flag_ids text[];
  v_beneficiary_ids text[];
  v_distribution_record_ids text[];
begin
  v_email := lower(nullif(trim(coalesce(old.email, '')), ''));

  select coalesce(array_agg(h.id), '{}'::text[])
    into v_household_ids
    from public.households h
    where h.applicant_user_id = old.id
       or (v_email is not null and lower(coalesce(h.applicant_email, '')) = v_email);

  select coalesce(array_agg(r.id), '{}'::text[])
    into v_resident_ids
    from public.residents r
    where r.household_id = any(v_household_ids);

  select coalesce(array_agg(vf.id), '{}'::text[])
    into v_vulnerability_flag_ids
    from public.vulnerability_flags vf
    where vf.resident_id = any(v_resident_ids);

  select coalesce(array_agg(b.id), '{}'::text[])
    into v_beneficiary_ids
    from public.beneficiaries b
    where b.resident_id = any(v_resident_ids);

  select coalesce(array_agg(dr.id), '{}'::text[])
    into v_distribution_record_ids
    from public.distribution_records dr
    where dr.household_id = any(v_household_ids)
       or dr.resident_id = any(v_resident_ids);

  -- Remove household/private payloads from audit and sync history too.
  delete from public.audit_logs
  where (entity_type = 'household' and entity_id = any(v_household_ids))
     or (entity_type = 'resident' and entity_id = any(v_resident_ids))
     or (entity_type = 'distribution' and entity_id = any(v_distribution_record_ids))
     or (entity_type = 'user' and entity_id = old.id::text);

  delete from public.sync_backups
  where (entity_type = 'households' and entity_id = any(v_household_ids))
     or (entity_type = 'residents' and entity_id = any(v_resident_ids))
     or (entity_type = 'vulnerability_flags' and entity_id = any(v_vulnerability_flag_ids))
     or (entity_type = 'beneficiaries' and entity_id = any(v_beneficiary_ids))
     or (entity_type = 'distribution_records' and entity_id = any(v_distribution_record_ids));

  -- QR logs and distribution records must be removed before households:
  -- their household/resident foreign keys are SET NULL, which would otherwise
  -- preserve history or violate distribution_records' one-target CHECK.
  delete from public.distribution_qr_scan_logs
  where household_id = any(v_household_ids)
     or claimant_user_id = old.id;

  delete from public.distribution_records
  where id = any(v_distribution_record_ids);

  delete from public.households
  where id = any(v_household_ids);

  -- Clean up user notifications
  delete from public.user_notifications
  where user_id = old.id;

  -- Clean up token tables
  delete from public.password_setup_tokens
  where user_id = old.id;

  delete from public.email_verification_tokens
  where user_id = old.id;

  return old;
end;
$$;

drop trigger if exists on_user_account_deleted on public.users;
create trigger on_user_account_deleted
before delete on public.users
for each row
execute function public.handle_user_account_deleted();

commit;
