begin;

alter table public.users
  alter column barangay_id set default 'anitapan';

update auth.users
set raw_user_meta_data = jsonb_set(
  coalesce(raw_user_meta_data, '{}'::jsonb),
  '{barangay_id}',
  to_jsonb(
    case
      when coalesce(raw_user_meta_data ->> 'barangay_id', '') = 'barangay-1' then 'anitapan'
      else coalesce(raw_user_meta_data ->> 'barangay_id', 'anitapan')
    end
  ),
  true
)
where coalesce(raw_user_meta_data ->> 'barangay_id', '') = ''
   or coalesce(raw_user_meta_data ->> 'barangay_id', '') = 'barangay-1';

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_barangay_id text;
begin
  v_role := case
    when coalesce(new.raw_user_meta_data ->> 'role', '') in ('admin', 'encoder', 'health_worker', 'responder', 'resident')
      then new.raw_user_meta_data ->> 'role'
    else 'resident'
  end;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  v_barangay_id := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'barangay_id'), ''),
    'anitapan'
  );

  insert into public.users (
    id,
    email,
    name,
    role,
    barangay_id,
    must_change_password,
    email_verification_required,
    email_verified_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    v_name,
    v_role,
    v_barangay_id,
    false,
    new.email_confirmed_at is null,
    new.email_confirmed_at
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    email_verification_required = excluded.email_verification_required,
    email_verified_at = excluded.email_verified_at,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

update public.users
set barangay_id = 'anitapan'
where barangay_id = 'barangay-1';

update public.households
set
  barangay_id = case lower(trim(coalesce(barangay_name, '')))
    when 'anitapan' then 'anitapan'
    when 'cabuyuan' then 'cabuyuan'
    when 'cadunan' then 'cadunan'
    when 'cuambog' then 'cuambog'
    when 'del pilar' then 'del-pilar'
    when 'golden valley' then 'golden-valley'
    when 'libodon' then 'libodon'
    when 'pangibiran' then 'pangibiran'
    when 'pindasan' then 'pindasan'
    when 'san antonio' then 'san-antonio'
    when 'tagnanan' then 'tagnanan'
    else 'anitapan'
  end,
  barangay_name = case
    when lower(trim(coalesce(barangay_name, ''))) = 'barangay 1' then 'Anitapan'
    else barangay_name
  end
where barangay_id = 'barangay-1';

update public.location_master_lists
set
  barangay_id = case lower(trim(coalesce(barangay_name, '')))
    when 'anitapan' then 'anitapan'
    when 'cabuyuan' then 'cabuyuan'
    when 'cadunan' then 'cadunan'
    when 'cuambog' then 'cuambog'
    when 'del pilar' then 'del-pilar'
    when 'golden valley' then 'golden-valley'
    when 'libodon' then 'libodon'
    when 'pangibiran' then 'pangibiran'
    when 'pindasan' then 'pindasan'
    when 'san antonio' then 'san-antonio'
    when 'tagnanan' then 'tagnanan'
    else 'anitapan'
  end,
  barangay_name = case
    when lower(trim(coalesce(barangay_name, ''))) = 'barangay 1' then 'Anitapan'
    else barangay_name
  end
where barangay_id = 'barangay-1';

delete from public.location_master_lists as legacy
where legacy.id = 'barangay-1'
  and exists (
    select 1
    from public.location_master_lists as replacement
    where replacement.id = legacy.barangay_id
      and replacement.id <> legacy.id
  );

update public.location_master_lists
set id = barangay_id
where id = 'barangay-1'
  and not exists (
    select 1
    from public.location_master_lists as replacement
    where replacement.id = public.location_master_lists.barangay_id
      and replacement.id <> public.location_master_lists.id
  );

update public.distribution_events
set barangay_id = 'anitapan'
where barangay_id = 'barangay-1';

commit;
