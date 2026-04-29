-- Migration: Resident Verification Status
-- Created at: 2026-04-23 15:00:00

begin;

-- 1. Create the verification status type if it doesn't exist
do $$
begin
  if not exists (select 1 from pg_type where typname = 'resident_verification_status') then
    create type public.resident_verification_status as enum ('pending', 'verified');
  end if;
end
$$;

-- 2. Add column to residents table
alter table public.residents
  add column if not exists verification_status public.resident_verification_status not null default 'pending';

-- 3. Initialize existing residents as verified
update public.residents
set verification_status = 'verified'
where verification_status = 'pending';

-- 4. Update create_household_bundle RPC
create or replace function public.create_household_bundle(
  p_household jsonb,
  p_members jsonb default '[]'::jsonb,
  p_actor_role text default null,
  p_actor_user_id uuid default null,
  p_actor_barangay_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households%rowtype;
  v_member jsonb;
  v_resident public.residents%rowtype;
  v_flags public.vulnerability_flags%rowtype;
  v_residents jsonb := '[]'::jsonb;
  v_flags_payload jsonb := '[]'::jsonb;
  v_members jsonb := case
    when jsonb_typeof(coalesce(p_members, '[]'::jsonb)) = 'array' then coalesce(p_members, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_household_barangay_id text := nullif(trim(coalesce(p_household ->> 'barangay_id', '')), '');
begin
  if p_actor_user_id is null then
    raise exception 'Authenticated user is required.';
  end if;

  if coalesce(p_actor_role, '') not in ('admin', 'encoder', 'resident') then
    raise exception 'You are not allowed to create households.';
  end if;

  if v_household_barangay_id is null then
    raise exception 'Household barangay_id is required.';
  end if;

  if p_actor_role = 'encoder'
    and coalesce(p_actor_barangay_id, '') <> v_household_barangay_id then
    raise exception 'You can only create households inside your barangay.';
  end if;

  if p_actor_role = 'resident'
    and coalesce(p_household ->> 'applicant_user_id', '') <> p_actor_user_id::text then
    raise exception 'Residents can only create their own household registrations.';
  end if;

  insert into public.households (
    id,
    head_name,
    head_id,
    barangay_id,
    applicant_user_id,
    applicant_email,
    barangay_name,
    municipality,
    purok_sitio,
    street_address,
    landmark_directions,
    contact_number,
    supporting_document_name,
    supporting_document_type,
    supporting_document_data,
    status,
    gps_lat,
    gps_long,
    location_source,
    location_confidence,
    location_verified,
    location_verified_at,
    location_verified_by,
    registration_status,
    registration_submitted_at,
    registration_reviewed_at,
    registration_reviewed_by,
    registration_review_notes,
    pin_qa_status,
    pin_qa_notes,
    created_at,
    updated_at,
    sync_status
  )
  values (
    coalesce(nullif(trim(p_household ->> 'id'), ''), gen_random_uuid()::text),
    coalesce(nullif(trim(p_household ->> 'head_name'), ''), ''),
    nullif(trim(p_household ->> 'head_id'), ''),
    v_household_barangay_id,
    case
      when nullif(trim(p_household ->> 'applicant_user_id'), '') is null then null
      else (p_household ->> 'applicant_user_id')::uuid
    end,
    nullif(trim(p_household ->> 'applicant_email'), ''),
    nullif(trim(p_household ->> 'barangay_name'), ''),
    nullif(trim(p_household ->> 'municipality'), ''),
    coalesce(nullif(trim(p_household ->> 'purok_sitio'), ''), ''),
    coalesce(nullif(trim(p_household ->> 'street_address'), ''), ''),
    nullif(trim(p_household ->> 'landmark_directions'), ''),
    nullif(trim(p_household ->> 'contact_number'), ''),
    nullif(trim(p_household ->> 'supporting_document_name'), ''),
    nullif(trim(p_household ->> 'supporting_document_type'), ''),
    nullif(trim(p_household ->> 'supporting_document_data'), ''),
    coalesce(nullif(trim(p_household ->> 'status'), ''), 'active'),
    case when nullif(trim(p_household ->> 'gps_lat'), '') is null then null else (p_household ->> 'gps_lat')::double precision end,
    case when nullif(trim(p_household ->> 'gps_long'), '') is null then null else (p_household ->> 'gps_long')::double precision end,
    nullif(trim(p_household ->> 'location_source'), ''),
    nullif(trim(p_household ->> 'location_confidence'), ''),
    coalesce((p_household ->> 'location_verified')::boolean, false),
    case when nullif(trim(p_household ->> 'location_verified_at'), '') is null then null else (p_household ->> 'location_verified_at')::timestamptz end,
    case
      when nullif(trim(p_household ->> 'location_verified_by'), '') is null then null
      else (p_household ->> 'location_verified_by')::uuid
    end,
    coalesce(nullif(trim(p_household ->> 'registration_status'), ''), 'pending'),
    case when nullif(trim(p_household ->> 'registration_submitted_at'), '') is null then null else (p_household ->> 'registration_submitted_at')::timestamptz end,
    case when nullif(trim(p_household ->> 'registration_reviewed_at'), '') is null then null else (p_household ->> 'registration_reviewed_at')::timestamptz end,
    case
      when nullif(trim(p_household ->> 'registration_reviewed_by'), '') is null then null
      else (p_household ->> 'registration_reviewed_by')::uuid
    end,
    nullif(trim(p_household ->> 'registration_review_notes'), ''),
    coalesce(nullif(trim(p_household ->> 'pin_qa_status'), ''), 'needs_verification'),
    nullif(trim(p_household ->> 'pin_qa_notes'), ''),
    timezone('utc', now()),
    timezone('utc', now()),
    'synced'
  )
  returning * into v_household;

  for v_member in
    select value
    from jsonb_array_elements(v_members)
  loop
    insert into public.residents (
      id,
      household_id,
      full_name,
      birthdate,
      gender,
      relationship_to_head,
      status,
      civil_status,
      occupation,
      income_level,
      contact_number,
      verification_status,
      created_at,
      updated_at,
      sync_status
    )
    values (
      coalesce(nullif(trim(v_member ->> 'id'), ''), gen_random_uuid()::text),
      v_household.id,
      coalesce(nullif(trim(v_member ->> 'full_name'), ''), ''),
      coalesce(nullif(trim(v_member ->> 'birthdate'), ''), current_date::text)::date,
      coalesce(nullif(trim(v_member ->> 'gender'), ''), 'M'),
      coalesce(nullif(trim(v_member ->> 'relationship_to_head'), ''), ''),
      coalesce(nullif(trim(v_member ->> 'status'), ''), 'active'),
      nullif(trim(v_member ->> 'civil_status'), ''),
      nullif(trim(v_member ->> 'occupation'), ''),
      nullif(trim(v_member ->> 'income_level'), ''),
      nullif(trim(v_member ->> 'contact_number'), ''),
      case
        when p_actor_role = 'admin' then 'verified'::public.resident_verification_status
        else 'pending'::public.resident_verification_status
      end,
      timezone('utc', now()),
      timezone('utc', now()),
      'synced'
    )
    returning * into v_resident;

    perform public.refresh_vulnerability_flags_for_resident(v_resident.id);

    update public.vulnerability_flags
    set
      is_pregnant = coalesce((v_member ->> 'is_pregnant')::boolean, is_pregnant),
      is_pwd = coalesce((v_member ->> 'is_pwd')::boolean, is_pwd),
      pwd_type = case
        when v_member ? 'pwd_type' then nullif(trim(v_member ->> 'pwd_type'), '')
        else pwd_type
      end,
      has_chronic_illness = coalesce((v_member ->> 'has_chronic_illness')::boolean, has_chronic_illness),
      chronic_conditions = case
        when v_member ? 'chronic_conditions' and jsonb_typeof(v_member -> 'chronic_conditions') = 'array'
          then array(
            select jsonb_array_elements_text(v_member -> 'chronic_conditions')
          )
        else chronic_conditions
      end,
      sync_status = 'synced'
    where resident_id = v_resident.id
    returning * into v_flags;

    if not found then
      select *
      into v_flags
      from public.vulnerability_flags
      where resident_id = v_resident.id;
    end if;

    v_residents := v_residents || jsonb_build_array(to_jsonb(v_resident));

    if v_flags.id is not null then
      v_flags_payload := v_flags_payload || jsonb_build_array(to_jsonb(v_flags));
    end if;
  end loop;

  return jsonb_build_object(
    'household', to_jsonb(v_household),
    'household_id', v_household.id,
    'residents', v_residents,
    'vulnerability_flags', v_flags_payload
  );
end;
$$;

-- 5. Update create_resident_bundle RPC
create or replace function public.create_resident_bundle(
  p_resident jsonb,
  p_actor_role text default null,
  p_actor_barangay_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resident public.residents%rowtype;
  v_flags public.vulnerability_flags%rowtype;
  v_household_barangay_id text;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to create residents.';
  end if;

  select h.barangay_id
  into v_household_barangay_id
  from public.households h
  where h.id = nullif(trim(p_resident ->> 'household_id'), '');

  if not found then
    raise exception 'Household not found for resident creation.';
  end if;

  if p_actor_role = 'encoder'
    and coalesce(p_actor_barangay_id, '') <> coalesce(v_household_barangay_id, '') then
    raise exception 'You can only manage residents inside your barangay.';
  end if;

  insert into public.residents (
    id,
    household_id,
    full_name,
    birthdate,
    gender,
    relationship_to_head,
    status,
    civil_status,
    occupation,
    income_level,
    contact_number,
    verification_status,
    created_at,
    updated_at,
    sync_status
  )
  values (
    coalesce(nullif(trim(p_resident ->> 'id'), ''), gen_random_uuid()::text),
    coalesce(nullif(trim(p_resident ->> 'household_id'), ''), ''),
    coalesce(nullif(trim(p_resident ->> 'full_name'), ''), ''),
    coalesce(nullif(trim(p_resident ->> 'birthdate'), ''), current_date::text)::date,
    coalesce(nullif(trim(p_resident ->> 'gender'), ''), 'M'),
    coalesce(nullif(trim(p_resident ->> 'relationship_to_head'), ''), ''),
    coalesce(nullif(trim(p_resident ->> 'status'), ''), 'active'),
    nullif(trim(p_resident ->> 'civil_status'), ''),
    nullif(trim(p_resident ->> 'occupation'), ''),
    nullif(trim(p_resident ->> 'income_level'), ''),
    nullif(trim(p_resident ->> 'contact_number'), ''),
    case
      when p_actor_role = 'admin' then 'verified'::public.resident_verification_status
      else 'pending'::public.resident_verification_status
    end,
    timezone('utc', now()),
    timezone('utc', now()),
    'synced'
  )
  returning * into v_resident;

  perform public.refresh_vulnerability_flags_for_resident(v_resident.id);

  update public.vulnerability_flags
  set
    is_pregnant = coalesce((p_resident ->> 'is_pregnant')::boolean, is_pregnant),
    is_pwd = coalesce((p_resident ->> 'is_pwd')::boolean, is_pwd),
    pwd_type = case
      when p_resident ? 'pwd_type' then nullif(trim(p_resident ->> 'pwd_type'), '')
      else pwd_type
    end,
    has_chronic_illness = coalesce((p_resident ->> 'has_chronic_illness')::boolean, has_chronic_illness),
    chronic_conditions = case
      when p_resident ? 'chronic_conditions' and jsonb_typeof(p_resident -> 'chronic_conditions') = 'array'
        then array(
          select jsonb_array_elements_text(p_resident -> 'chronic_conditions')
        )
      else chronic_conditions
    end,
    sync_status = 'synced'
  where resident_id = v_resident.id
  returning * into v_flags;

  if not found then
    select *
    into v_flags
    from public.vulnerability_flags
    where resident_id = v_resident.id;
  end if;

  return jsonb_build_object(
    'resident', to_jsonb(v_resident),
    'resident_id', v_resident.id,
    'vulnerability_flags', to_jsonb(v_flags)
  );
end;
$$;

-- 6. Update update_resident_bundle RPC
create or replace function public.update_resident_bundle(
  p_resident_id text,
  p_updates jsonb,
  p_actor_role text default null,
  p_actor_barangay_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.residents%rowtype;
  v_resident public.residents%rowtype;
  v_flags public.vulnerability_flags%rowtype;
  v_household_barangay_id text;
  v_should_reset_verification boolean := false;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to update residents.';
  end if;

  select *
  into v_existing
  from public.residents
  where id = p_resident_id;

  if not found then
    raise exception 'Resident not found.';
  end if;

  select h.barangay_id
  into v_household_barangay_id
  from public.households h
  where h.id = v_existing.household_id;

  if p_actor_role = 'encoder'
    and coalesce(p_actor_barangay_id, '') <> coalesce(v_household_barangay_id, '') then
    raise exception 'You can only manage residents inside your barangay.';
  end if;

  -- Detect if sensitive fields are being updated to reset verification
  if (
    p_updates ? 'full_name' or
    p_updates ? 'birthdate' or
    p_updates ? 'gender' or
    p_updates ? 'relationship_to_head' or
    p_updates ? 'civil_status' or
    p_updates ? 'occupation' or
    p_updates ? 'income_level'
  ) then
    v_should_reset_verification := true;
  end if;

  update public.residents
  set
    full_name = case
      when p_updates ? 'full_name' then coalesce(nullif(trim(p_updates ->> 'full_name'), ''), full_name)
      else full_name
    end,
    birthdate = case
      when p_updates ? 'birthdate' then coalesce(nullif(trim(p_updates ->> 'birthdate'), ''), birthdate::text)::date
      else birthdate
    end,
    gender = case
      when p_updates ? 'gender' then coalesce(nullif(trim(p_updates ->> 'gender'), ''), gender)
      else gender
    end,
    relationship_to_head = case
      when p_updates ? 'relationship_to_head'
        then coalesce(nullif(trim(p_updates ->> 'relationship_to_head'), ''), relationship_to_head)
      else relationship_to_head
    end,
    status = case
      when p_updates ? 'status' then coalesce(nullif(trim(p_updates ->> 'status'), ''), status)
      else status
    end,
    civil_status = case
      when p_updates ? 'civil_status' then nullif(trim(coalesce(p_updates ->> 'civil_status', '')), '')
      else civil_status
    end,
    occupation = case
      when p_updates ? 'occupation' then nullif(trim(coalesce(p_updates ->> 'occupation', '')), '')
      else occupation
    end,
    income_level = case
      when p_updates ? 'income_level' then nullif(trim(coalesce(p_updates ->> 'income_level', '')), '')
      else income_level
    end,
    contact_number = case
      when p_updates ? 'contact_number' then nullif(trim(coalesce(p_updates ->> 'contact_number', '')), '')
      else contact_number
    end,
    verification_status = case
      when v_should_reset_verification and p_actor_role <> 'admin' then 'pending'::public.resident_verification_status
      else verification_status
    end,
    sync_status = 'synced'
  where id = p_resident_id
  returning * into v_resident;

  perform public.refresh_vulnerability_flags_for_resident(v_resident.id);

  update public.vulnerability_flags
  set
    is_pregnant = case
      when p_updates ? 'is_pregnant' then coalesce((p_updates ->> 'is_pregnant')::boolean, is_pregnant)
      else is_pregnant
    end,
    is_pwd = case
      when p_updates ? 'is_pwd' then coalesce((p_updates ->> 'is_pwd')::boolean, is_pwd)
      else is_pwd
    end,
    pwd_type = case
      when p_updates ? 'pwd_type' then nullif(trim(coalesce(p_updates ->> 'pwd_type', '')), '')
      else pwd_type
    end,
    has_chronic_illness = case
      when p_updates ? 'has_chronic_illness'
        then coalesce((p_updates ->> 'has_chronic_illness')::boolean, has_chronic_illness)
      else has_chronic_illness
    end,
    chronic_conditions = case
      when p_updates ? 'chronic_conditions' and jsonb_typeof(p_updates -> 'chronic_conditions') = 'array'
        then array(
          select jsonb_array_elements_text(p_updates -> 'chronic_conditions')
        )
      else chronic_conditions
    end,
    sync_status = 'synced'
  where resident_id = v_resident.id
  returning * into v_flags;

  if not found then
    select *
    into v_flags
    from public.vulnerability_flags
    where resident_id = v_resident.id;
  end if;

  return jsonb_build_object(
    'resident', to_jsonb(v_resident),
    'resident_id', v_resident.id,
    'vulnerability_flags', to_jsonb(v_flags)
  );
end;
$$;

-- 7. Create verify_resident_bundle RPC
create or replace function public.verify_resident_bundle(
  p_resident_id text,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resident public.residents%rowtype;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to verify residents.';
  end if;

  update public.residents
  set
    verification_status = 'verified'::public.resident_verification_status,
    sync_status = 'synced'
  where id = p_resident_id
  returning * into v_resident;

  if not found then
    raise exception 'Resident not found.';
  end if;

  return to_jsonb(v_resident);
end;
$$;

commit;
