begin;

alter table public.users
  add column if not exists record_version integer not null default 1;

alter table public.location_master_lists
  add column if not exists record_version integer not null default 1;

alter table public.households
  add column if not exists record_version integer not null default 1;

alter table public.residents
  add column if not exists record_version integer not null default 1;

alter table public.vulnerability_flags
  add column if not exists record_version integer not null default 1;

alter table public.programs
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists record_version integer not null default 1;

alter table public.beneficiaries
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists record_version integer not null default 1;

alter table public.inventory_items
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists record_version integer not null default 1;

alter table public.package_templates
  add column if not exists record_version integer not null default 1;

alter table public.distribution_events
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists record_version integer not null default 1;

alter table public.incidents
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists record_version integer not null default 1;

create or replace function public.touch_updated_at_and_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());

  if (
    to_jsonb(new) - 'updated_at' - 'record_version'
    is distinct from
    to_jsonb(old) - 'updated_at' - 'record_version'
  ) then
    new.record_version = coalesce(old.record_version, 0) + 1;
  else
    new.record_version = coalesce(old.record_version, new.record_version, 1);
  end if;

  return new;
end;
$$;

drop trigger if exists users_touch_updated_at_and_version on public.users;
drop trigger if exists users_set_updated_at on public.users;
create trigger users_touch_updated_at_and_version
before update on public.users
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists location_master_lists_touch_updated_at_and_version on public.location_master_lists;
drop trigger if exists location_master_lists_set_updated_at on public.location_master_lists;
create trigger location_master_lists_touch_updated_at_and_version
before update on public.location_master_lists
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists households_touch_updated_at_and_version on public.households;
drop trigger if exists households_set_updated_at on public.households;
create trigger households_touch_updated_at_and_version
before update on public.households
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists residents_touch_updated_at_and_version on public.residents;
drop trigger if exists residents_set_updated_at on public.residents;
create trigger residents_touch_updated_at_and_version
before update on public.residents
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists vulnerability_flags_touch_updated_at_and_version on public.vulnerability_flags;
drop trigger if exists vulnerability_flags_set_updated_at on public.vulnerability_flags;
create trigger vulnerability_flags_touch_updated_at_and_version
before update on public.vulnerability_flags
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists programs_touch_updated_at_and_version on public.programs;
create trigger programs_touch_updated_at_and_version
before update on public.programs
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists beneficiaries_touch_updated_at_and_version on public.beneficiaries;
create trigger beneficiaries_touch_updated_at_and_version
before update on public.beneficiaries
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists inventory_items_touch_updated_at_and_version on public.inventory_items;
create trigger inventory_items_touch_updated_at_and_version
before update on public.inventory_items
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists package_templates_touch_updated_at_and_version on public.package_templates;
drop trigger if exists package_templates_set_updated_at on public.package_templates;
create trigger package_templates_touch_updated_at_and_version
before update on public.package_templates
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists distribution_events_touch_updated_at_and_version on public.distribution_events;
create trigger distribution_events_touch_updated_at_and_version
before update on public.distribution_events
for each row
execute function public.touch_updated_at_and_version();

drop trigger if exists incidents_touch_updated_at_and_version on public.incidents;
create trigger incidents_touch_updated_at_and_version
before update on public.incidents
for each row
execute function public.touch_updated_at_and_version();

create index if not exists users_barangay_id_idx on public.users (barangay_id);
create index if not exists users_role_idx on public.users (role);
create index if not exists location_master_lists_barangay_id_idx on public.location_master_lists (barangay_id);
create index if not exists households_applicant_user_id_idx on public.households (applicant_user_id);
create index if not exists households_applicant_email_idx on public.households (applicant_email);
create index if not exists audit_logs_user_id_timestamp_idx on public.audit_logs (user_id, "timestamp" desc);
create index if not exists beneficiaries_program_id_idx on public.beneficiaries (program_id);

create or replace function public.can_access_beneficiary(target_beneficiary_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.beneficiaries b
    where b.id = target_beneficiary_id
      and (
        public.is_admin()
        or public.can_access_resident(b.resident_id)
      )
  )
$$;

drop policy if exists "location_master_lists_read_authenticated" on public.location_master_lists;
create policy "location_master_lists_read_scoped"
on public.location_master_lists
for select
using (
  public.is_admin()
  or barangay_id = public.current_user_barangay_id()
);

drop policy if exists "beneficiaries_read_authenticated" on public.beneficiaries;
create policy "beneficiaries_read_scoped"
on public.beneficiaries
for select
using (public.can_access_beneficiary(id));

create or replace function public.array_unique_trimmed(input_topics text[])
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(distinct topic),
    '{}'::text[]
  )
  from unnest(coalesce(input_topics, '{}'::text[])) as topic
  where nullif(trim(topic), '') is not null
$$;

create or replace function public.registry_topics_for_household_row(input_row jsonb)
returns text[]
language sql
stable
as $$
  select public.array_unique_trimmed(array[
    'role:admin:registry',
    case
      when coalesce(input_row ->> 'barangay_id', '') <> ''
        then format('barangay:%s:registry', input_row ->> 'barangay_id')
      else null
    end,
    case
      when coalesce(input_row ->> 'applicant_user_id', '') <> ''
        then format('user:%s:registry', input_row ->> 'applicant_user_id')
      else null
    end
  ]);
$$;

create or replace function public.registry_topics_for_resident_id(target_resident_id text)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with resident_scope as (
    select
      h.barangay_id,
      h.applicant_user_id::text as applicant_user_id
    from public.residents r
    join public.households h on h.id = r.household_id
    where r.id = target_resident_id
    limit 1
  )
  select public.array_unique_trimmed(array[
    'role:admin:registry',
    case
      when exists(select 1 from resident_scope)
        then format('barangay:%s:registry', (select barangay_id from resident_scope))
      else null
    end,
    case
      when coalesce((select applicant_user_id from resident_scope), '') <> ''
        then format('user:%s:registry', (select applicant_user_id from resident_scope))
      else null
    end
  ]);
$$;

create or replace function public.audit_topics_for_user(target_user_id uuid)
returns text[]
language sql
stable
as $$
  select public.array_unique_trimmed(array[
    'role:admin:audit',
    case
      when target_user_id is not null
        then format('user:%s:audit', target_user_id::text)
      else null
    end
  ]);
$$;

create or replace function public.emit_db_change(
  topics text[],
  operation_name text,
  schema_name text,
  table_name text,
  new_record jsonb,
  old_record jsonb
)
returns void
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  topic text;
begin
  foreach topic in array public.array_unique_trimmed(topics)
  loop
    perform realtime.send(
      jsonb_build_object(
        'schema', schema_name,
        'table', table_name,
        'operation', operation_name,
        'record', new_record,
        'old_record', old_record
      ),
      operation_name,
      topic,
      true
    );
  end loop;
end;
$$;

create or replace function public.broadcast_household_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    public.array_unique_trimmed(
      public.registry_topics_for_household_row(new_record)
      || public.registry_topics_for_household_row(old_record)
    ),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_resident_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    public.array_unique_trimmed(
      public.registry_topics_for_resident_id(coalesce(new_record ->> 'id', old_record ->> 'id'))
    ),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_vulnerability_flag_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    public.array_unique_trimmed(
      public.registry_topics_for_resident_id(coalesce(new_record ->> 'resident_id', old_record ->> 'resident_id'))
    ),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_location_master_list_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  scoped_barangay_id text := coalesce(new_record ->> 'barangay_id', old_record ->> 'barangay_id');
begin
  perform public.emit_db_change(
    public.array_unique_trimmed(array[
      'role:admin:registry',
      case
        when coalesce(scoped_barangay_id, '') <> ''
          then format('barangay:%s:registry', scoped_barangay_id)
        else null
      end
    ]),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_program_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    array['global:programs'],
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_beneficiary_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    public.array_unique_trimmed(
      public.registry_topics_for_resident_id(coalesce(new_record ->> 'resident_id', old_record ->> 'resident_id'))
    ),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_inventory_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    array['role:admin:inventory', 'role:admin_encoder:inventory'],
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_distribution_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    array['role:admin:distribution', 'role:admin_encoder:distribution'],
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_incident_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    array['role:admin:incidents', 'role:incident_staff:incidents'],
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

create or replace function public.broadcast_audit_log_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  new_record jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_record jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  perform public.emit_db_change(
    public.audit_topics_for_user(
      coalesce((new_record ->> 'user_id')::uuid, (old_record ->> 'user_id')::uuid)
    ),
    tg_op,
    tg_table_schema,
    tg_table_name,
    new_record,
    old_record
  );
  return null;
end;
$$;

drop trigger if exists households_broadcast_change on public.households;
create trigger households_broadcast_change
after insert or update or delete on public.households
for each row
execute function public.broadcast_household_change();

drop trigger if exists residents_broadcast_change on public.residents;
create trigger residents_broadcast_change
after insert or update or delete on public.residents
for each row
execute function public.broadcast_resident_change();

drop trigger if exists vulnerability_flags_broadcast_change on public.vulnerability_flags;
create trigger vulnerability_flags_broadcast_change
after insert or update or delete on public.vulnerability_flags
for each row
execute function public.broadcast_vulnerability_flag_change();

drop trigger if exists location_master_lists_broadcast_change on public.location_master_lists;
create trigger location_master_lists_broadcast_change
after insert or update or delete on public.location_master_lists
for each row
execute function public.broadcast_location_master_list_change();

drop trigger if exists programs_broadcast_change on public.programs;
create trigger programs_broadcast_change
after insert or update or delete on public.programs
for each row
execute function public.broadcast_program_change();

drop trigger if exists beneficiaries_broadcast_change on public.beneficiaries;
create trigger beneficiaries_broadcast_change
after insert or update or delete on public.beneficiaries
for each row
execute function public.broadcast_beneficiary_change();

drop trigger if exists inventory_items_broadcast_change on public.inventory_items;
create trigger inventory_items_broadcast_change
after insert or update or delete on public.inventory_items
for each row
execute function public.broadcast_inventory_change();

drop trigger if exists inventory_movements_broadcast_change on public.inventory_movements;
create trigger inventory_movements_broadcast_change
after insert or update or delete on public.inventory_movements
for each row
execute function public.broadcast_inventory_change();

drop trigger if exists package_templates_broadcast_change on public.package_templates;
create trigger package_templates_broadcast_change
after insert or update or delete on public.package_templates
for each row
execute function public.broadcast_inventory_change();

drop trigger if exists distribution_events_broadcast_change on public.distribution_events;
create trigger distribution_events_broadcast_change
after insert or update or delete on public.distribution_events
for each row
execute function public.broadcast_distribution_change();

drop trigger if exists distribution_records_broadcast_change on public.distribution_records;
create trigger distribution_records_broadcast_change
after insert or update or delete on public.distribution_records
for each row
execute function public.broadcast_distribution_change();

drop trigger if exists incidents_broadcast_change on public.incidents;
create trigger incidents_broadcast_change
after insert or update or delete on public.incidents
for each row
execute function public.broadcast_incident_change();

drop trigger if exists audit_logs_broadcast_change on public.audit_logs;
create trigger audit_logs_broadcast_change
after insert or update or delete on public.audit_logs
for each row
execute function public.broadcast_audit_log_change();

drop policy if exists "mswdo_realtime_broadcast_receive" on realtime.messages;
create policy "mswdo_realtime_broadcast_receive"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    (select realtime.topic()) = 'global:programs'
    or (
      public.is_admin()
      and (select realtime.topic()) in (
        'role:admin:registry',
        'role:admin:inventory',
        'role:admin:distribution',
        'role:admin:incidents',
        'role:admin:audit'
      )
    )
    or (
      coalesce(public.current_user_role(), '') = 'encoder'
      and (select realtime.topic()) in (
        'role:admin_encoder:inventory',
        'role:admin_encoder:distribution',
        'role:incident_staff:incidents'
      )
    )
    or (
      coalesce(public.current_user_role(), '') in ('health_worker', 'responder')
      and (select realtime.topic()) = 'role:incident_staff:incidents'
    )
    or (
      split_part((select realtime.topic()), ':', 1) = 'barangay'
      and split_part((select realtime.topic()), ':', 2) = coalesce(public.current_user_barangay_id(), '')
      and split_part((select realtime.topic()), ':', 3) = 'registry'
      and coalesce(public.current_user_role(), '') in ('encoder', 'health_worker', 'responder')
    )
    or (
      split_part((select realtime.topic()), ':', 1) = 'user'
      and split_part((select realtime.topic()), ':', 2) = coalesce(auth.uid()::text, '')
      and split_part((select realtime.topic()), ':', 3) in ('registry', 'audit')
    )
  )
);

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
    coalesce(nullif(trim(p_household ->> 'registration_status'), ''), 'approved'),
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

create or replace function public.create_inventory_item_bundle(
  p_item jsonb,
  p_actor_role text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_movements jsonb := '[]'::jsonb;
  v_actor_name text;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to manage inventory.';
  end if;

  select name
  into v_actor_name
  from public.users
  where id = p_actor_user_id;

  insert into public.inventory_items (
    id,
    item_name,
    item_code,
    category,
    quantity_available,
    unit,
    reorder_level,
    storage_location,
    expiration_date,
    notes,
    sync_status
  )
  values (
    coalesce(nullif(trim(p_item ->> 'id'), ''), gen_random_uuid()::text),
    coalesce(nullif(trim(p_item ->> 'item_name'), ''), ''),
    nullif(trim(p_item ->> 'item_code'), ''),
    coalesce(nullif(trim(p_item ->> 'category'), ''), 'other'),
    greatest(coalesce((p_item ->> 'quantity_available')::numeric, 0), 0),
    coalesce(nullif(trim(p_item ->> 'unit'), ''), 'pcs'),
    greatest(coalesce((p_item ->> 'reorder_level')::numeric, 10), 0),
    nullif(trim(p_item ->> 'storage_location'), ''),
    case when nullif(trim(p_item ->> 'expiration_date'), '') is null then null else (p_item ->> 'expiration_date')::date end,
    nullif(trim(p_item ->> 'notes'), ''),
    'synced'
  )
  returning * into v_item;

  if v_item.quantity_available > 0 then
    insert into public.inventory_movements (
      id,
      item_id,
      item_name,
      type,
      quantity,
      previous_quantity,
      new_quantity,
      unit,
      performed_by,
      performed_by_name,
      reference_id,
      reference_type,
      notes,
      "timestamp",
      sync_status
    )
    values (
      format('mov_%s_%s', floor(extract(epoch from clock_timestamp()) * 1000)::bigint, substr(md5(random()::text), 1, 9)),
      v_item.id,
      v_item.item_name,
      'stock_in',
      v_item.quantity_available,
      0,
      v_item.quantity_available,
      v_item.unit,
      p_actor_user_id,
      v_actor_name,
      v_item.id,
      'inventory',
      'Opening stock',
      timezone('utc', now()),
      'synced'
    )
    returning * into v_movement;

    v_movements := v_movements || jsonb_build_array(to_jsonb(v_movement));
  end if;

  return jsonb_build_object(
    'inventory_item', to_jsonb(v_item),
    'inventory_item_id', v_item.id,
    'inventory_movements', v_movements
  );
end;
$$;

create or replace function public.apply_inventory_transaction_bundle(
  p_item_id text,
  p_type text,
  p_quantity numeric,
  p_next_quantity numeric default null,
  p_notes text default null,
  p_reference_id text default null,
  p_reference_type text default null,
  p_actor_role text default null,
  p_actor_user_id uuid default null,
  p_expected_record_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_updated_item public.inventory_items%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_actor_name text;
  v_quantity numeric := greatest(coalesce(p_quantity, 0), 0);
  v_next_quantity numeric;
  v_movement_quantity numeric;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to manage inventory.';
  end if;

  if coalesce(nullif(trim(p_type), ''), '') not in ('stock_in', 'stock_out', 'adjustment', 'distribution_release', 'transfer') then
    raise exception 'Unsupported inventory transaction type.';
  end if;

  select *
  into v_item
  from public.inventory_items
  where id = p_item_id
  for update;

  if not found then
    raise exception 'Inventory item not found.';
  end if;

  if p_expected_record_version is not null
    and coalesce(v_item.record_version, 1) <> p_expected_record_version then
    raise exception 'Conflict detected while updating inventory. Refresh before retrying.';
  end if;

  if p_type <> 'adjustment' and v_quantity <= 0 then
    raise exception 'Transaction quantity must be greater than zero.';
  end if;

  if p_type in ('stock_out', 'distribution_release', 'transfer')
    and v_item.quantity_available < v_quantity then
    raise exception 'Not enough stock for this transaction.';
  end if;

  v_next_quantity := case
    when p_next_quantity is not null then greatest(p_next_quantity, 0)
    when p_type = 'stock_in' then v_item.quantity_available + v_quantity
    else greatest(v_item.quantity_available - v_quantity, 0)
  end;

  v_movement_quantity := case
    when p_type = 'adjustment' then abs(v_next_quantity - v_item.quantity_available)
    else v_quantity
  end;

  select name
  into v_actor_name
  from public.users
  where id = p_actor_user_id;

  update public.inventory_items
  set
    quantity_available = v_next_quantity,
    sync_status = 'synced'
  where id = v_item.id
  returning * into v_updated_item;

  insert into public.inventory_movements (
    id,
    item_id,
    item_name,
    type,
    quantity,
    previous_quantity,
    new_quantity,
    unit,
    performed_by,
    performed_by_name,
    reference_id,
    reference_type,
    notes,
    "timestamp",
    sync_status
  )
  values (
    format('mov_%s_%s', floor(extract(epoch from clock_timestamp()) * 1000)::bigint, substr(md5(random()::text), 1, 9)),
    v_updated_item.id,
    v_updated_item.item_name,
    p_type,
    v_movement_quantity,
    v_item.quantity_available,
    v_updated_item.quantity_available,
    v_updated_item.unit,
    p_actor_user_id,
    v_actor_name,
    nullif(trim(coalesce(p_reference_id, '')), ''),
    nullif(trim(coalesce(p_reference_type, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    timezone('utc', now()),
    'synced'
  )
  returning * into v_movement;

  return jsonb_build_object(
    'inventory_item', to_jsonb(v_updated_item),
    'inventory_item_id', v_updated_item.id,
    'inventory_movement', to_jsonb(v_movement)
  );
end;
$$;

create or replace function public.release_distribution_package_bundle(
  p_event_id text,
  p_household_id text default null,
  p_resident_id text default null,
  p_received_by_name text default null,
  p_notes text default null,
  p_actor_role text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.distribution_events%rowtype;
  v_household public.households%rowtype;
  v_resident public.residents%rowtype;
  v_actor_name text;
  v_package_item jsonb;
  v_inventory_item public.inventory_items%rowtype;
  v_updated_item public.inventory_items%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_record public.distribution_records%rowtype;
  v_inventory_payload jsonb := '[]'::jsonb;
  v_movements_payload jsonb := '[]'::jsonb;
  v_distributed_items jsonb := '[]'::jsonb;
  v_item_id text;
  v_item_quantity numeric;
  v_received_name text := nullif(trim(coalesce(p_received_by_name, '')), '');
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to release distribution packages.';
  end if;

  select *
  into v_event
  from public.distribution_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Distribution event not found.';
  end if;

  if jsonb_typeof(v_event.package_items) <> 'array'
    or jsonb_array_length(v_event.package_items) = 0 then
    raise exception 'This event has no package items configured yet.';
  end if;

  select name
  into v_actor_name
  from public.users
  where id = p_actor_user_id;

  if v_event.target_scope = 'household' then
    if nullif(trim(coalesce(p_household_id, '')), '') is null then
      raise exception 'A household is required for this distribution event.';
    end if;

    select *
    into v_household
    from public.households
    where id = p_household_id
      and status = 'active';

    if not found then
      raise exception 'Selected household is not available for distribution.';
    end if;

    if exists (
      select 1
      from public.distribution_records
      where event_id = v_event.id
        and household_id = v_household.id
    ) then
      raise exception 'This household already claimed this package.';
    end if;
  else
    if nullif(trim(coalesce(p_resident_id, '')), '') is null then
      raise exception 'A resident is required for this distribution event.';
    end if;

    select *
    into v_resident
    from public.residents
    where id = p_resident_id
      and status = 'active';

    if not found then
      raise exception 'Selected resident is not available for distribution.';
    end if;

    select *
    into v_household
    from public.households
    where id = v_resident.household_id;

    if exists (
      select 1
      from public.distribution_records
      where event_id = v_event.id
        and resident_id = v_resident.id
    ) then
      raise exception 'This resident already claimed this package.';
    end if;
  end if;

  for v_package_item in
    select value
    from jsonb_array_elements(v_event.package_items)
  loop
    v_item_id := nullif(trim(v_package_item ->> 'item_id'), '');
    v_item_quantity := greatest(coalesce((v_package_item ->> 'quantity')::numeric, 0), 0);

    if v_item_id is null or v_item_quantity <= 0 then
      raise exception 'Invalid package item detected for this event.';
    end if;

    select *
    into v_inventory_item
    from public.inventory_items
    where id = v_item_id
    for update;

    if not found then
      raise exception 'Inventory item % was not found.', coalesce(v_package_item ->> 'item_name', v_item_id);
    end if;

    if v_inventory_item.quantity_available < v_item_quantity then
      raise exception 'Not enough stock for %.', v_inventory_item.item_name;
    end if;

    update public.inventory_items
    set
      quantity_available = v_inventory_item.quantity_available - v_item_quantity,
      sync_status = 'synced'
    where id = v_inventory_item.id
    returning * into v_updated_item;

    insert into public.inventory_movements (
      id,
      item_id,
      item_name,
      type,
      quantity,
      previous_quantity,
      new_quantity,
      unit,
      performed_by,
      performed_by_name,
      reference_id,
      reference_type,
      notes,
      "timestamp",
      sync_status
    )
    values (
      format('mov_%s_%s', floor(extract(epoch from clock_timestamp()) * 1000)::bigint, substr(md5(random()::text), 1, 9)),
      v_updated_item.id,
      v_updated_item.item_name,
      'distribution_release',
      v_item_quantity,
      v_inventory_item.quantity_available,
      v_updated_item.quantity_available,
      v_updated_item.unit,
      p_actor_user_id,
      v_actor_name,
      v_event.id,
      'distribution',
      format('Released for event %s', v_event.event_name),
      timezone('utc', now()),
      'synced'
    )
    returning * into v_movement;

    v_inventory_payload := v_inventory_payload || jsonb_build_array(to_jsonb(v_updated_item));
    v_movements_payload := v_movements_payload || jsonb_build_array(to_jsonb(v_movement));
    v_distributed_items := v_distributed_items || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_updated_item.id,
        'quantity', v_item_quantity,
        'item_name', coalesce(nullif(trim(v_package_item ->> 'item_name'), ''), v_updated_item.item_name),
        'unit', coalesce(nullif(trim(v_package_item ->> 'unit'), ''), v_updated_item.unit)
      )
    );
  end loop;

  insert into public.distribution_records (
    id,
    event_id,
    household_id,
    resident_id,
    beneficiary_name,
    items_distributed,
    received_by_name,
    "timestamp",
    distributor_id,
    notes,
    sync_status
  )
  values (
    format('dist_%s_%s', floor(extract(epoch from clock_timestamp()) * 1000)::bigint, substr(md5(random()::text), 1, 9)),
    v_event.id,
    case when v_event.target_scope = 'household' then v_household.id else null end,
    case when v_event.target_scope = 'resident' then v_resident.id else null end,
    case
      when v_event.target_scope = 'resident' then coalesce(v_resident.full_name, v_received_name)
      else coalesce(v_household.head_name, v_received_name)
    end,
    v_distributed_items,
    coalesce(
      v_received_name,
      case when v_event.target_scope = 'resident' then v_resident.full_name else v_household.head_name end
    ),
    timezone('utc', now()),
    p_actor_user_id,
    nullif(trim(coalesce(p_notes, '')), ''),
    'synced'
  )
  returning * into v_record;

  return jsonb_build_object(
    'distribution_record', to_jsonb(v_record),
    'distribution_record_id', v_record.id,
    'inventory_items', v_inventory_payload,
    'inventory_movements', v_movements_payload
  );
end;
$$;

create or replace function public.delete_distribution_event_bundle(
  p_event_id text,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.distribution_events%rowtype;
  v_deleted_records jsonb := '[]'::jsonb;
begin
  if coalesce(p_actor_role, '') not in ('admin', 'encoder') then
    raise exception 'You are not allowed to delete distribution events.';
  end if;

  select *
  into v_event
  from public.distribution_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Distribution event not found.';
  end if;

  with deleted_records as (
    delete from public.distribution_records
    where event_id = p_event_id
    returning to_jsonb(distribution_records.*) as row_data
  )
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into v_deleted_records
  from deleted_records;

  delete from public.distribution_events
  where id = p_event_id;

  return jsonb_build_object(
    'event_id', p_event_id,
    'deleted_records', v_deleted_records
  );
end;
$$;

commit;
