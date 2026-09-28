begin;

-- =============================================================================
-- Migration: MSWDO Confidential Social Cases & VAWC Management Module
-- Protects confidential case records on VAWC (RA 9262), Child Abuse (RA 7610),
-- Rape, and CICL under Philippine Law and the Data Privacy Act of 2012.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Update public.users role check constraint to include 'social_worker'
-- -----------------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('admin', 'social_worker', 'encoder', 'health_worker', 'responder', 'resident'));

-- Update handle_auth_user_created trigger function to recognize 'social_worker'
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_name text;
  v_first_name text;
  v_middle_name text;
  v_last_name text;
  v_barangay_id text;
begin
  v_role := case
    when coalesce(new.raw_user_meta_data ->> 'role', '') in ('admin', 'social_worker', 'encoder', 'health_worker', 'responder', 'resident')
      then new.raw_user_meta_data ->> 'role'
    else 'resident'
  end;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  v_first_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), '');
  v_middle_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'middle_name', '')), '');
  v_last_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '');

  if v_first_name is null and v_middle_name is null and v_last_name is null then
    select parts.first_name, parts.middle_name, parts.last_name
      into v_first_name, v_middle_name, v_last_name
      from public.split_full_name(v_name) as parts;
  end if;

  v_barangay_id := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'barangay_id'), ''),
    'anitapan'
  );

  insert into public.users (
    id,
    email,
    name,
    first_name,
    middle_name,
    last_name,
    role,
    status,
    barangay_id,
    must_change_password,
    email_verification_required,
    email_verified_at,
    created_at,
    updated_at
  ) values (
    new.id,
    new.email,
    v_name,
    coalesce(v_first_name, v_name),
    coalesce(v_middle_name, ''),
    coalesce(v_last_name, ''),
    v_role,
    'active',
    v_barangay_id,
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false),
    coalesce((new.raw_user_meta_data ->> 'email_verification_required')::boolean, false),
    case
      when coalesce((new.raw_user_meta_data ->> 'email_verification_required')::boolean, false) then null
      else timezone('utc', now())
    end,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = excluded.name,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    last_name = excluded.last_name,
    role = excluded.role,
    barangay_id = excluded.barangay_id,
    updated_at = timezone('utc', now());

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Create public.cases Table
-- -----------------------------------------------------------------------------
create table if not exists public.cases (
  id text primary key default ('case_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  case_number text not null unique,
  case_type text not null check (
    case_type in (
      'vawc_physical',
      'vawc_psychological',
      'vawc_sexual',
      'vawc_economic',
      'vac_abuse',
      'vac_neglect',
      'vac_exploitation',
      'rape',
      'cicl',
      'other'
    )
  ),
  reported_at timestamptz not null default timezone('utc', now()),
  incident_date date,
  victim_name text not null,
  victim_age integer check (victim_age is null or (victim_age >= 0 and victim_age <= 130)),
  victim_gender text check (victim_gender is null or victim_gender in ('F', 'M', 'Other')),
  victim_contact text,
  victim_address text,
  barangay_id text not null default 'cadunan',
  purok_sitio text,
  perpetrator_name text,
  perpetrator_relationship text,
  perpetrator_address text,
  status text not null default 'active' check (
    status in (
      'active',
      'under_bpo_tpo',
      'referred_pnp_wcpd',
      'filed_in_court',
      'resolved_closed',
      'monitoring'
    )
  ),
  case_summary text not null,
  intake_notes text,
  assigned_worker_id text,
  assigned_worker_name text,
  resident_id text references public.residents (id) on delete set null,
  household_id text references public.households (id) on delete set null,
  source text not null default 'manual_intake' check (source in ('excel_import', 'manual_intake')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 3. Create public.case_attachments Table
-- -----------------------------------------------------------------------------
create table if not exists public.case_attachments (
  id text primary key default ('att_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  case_id text not null references public.cases (id) on delete cascade,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_size integer,
  file_url text not null,
  document_type text not null default 'intake_sheet' check (
    document_type in (
      'intake_sheet',
      'bpo_tpo',
      'medico_legal',
      'pnp_blotter',
      'court_order',
      'progress_report',
      'other'
    )
  ),
  uploaded_by text not null default 'Social Worker',
  uploaded_at timestamptz not null default timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 4. Create public.case_notes Table
-- -----------------------------------------------------------------------------
create table if not exists public.case_notes (
  id text primary key default ('note_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 7)),
  case_id text not null references public.cases (id) on delete cascade,
  worker_id text,
  worker_name text not null default 'Social Worker',
  date date not null default current_date,
  note text not null,
  action_taken text,
  next_follow_up date,
  created_at timestamptz not null default timezone('utc', now())
);

-- -----------------------------------------------------------------------------
-- 5. Performance Indexes for Search & Case Queries
-- -----------------------------------------------------------------------------
create index if not exists cases_case_number_idx on public.cases (case_number);
create index if not exists cases_victim_name_idx on public.cases (victim_name);
create index if not exists cases_barangay_id_idx on public.cases (barangay_id);
create index if not exists cases_status_idx on public.cases (status);
create index if not exists cases_case_type_idx on public.cases (case_type);
create index if not exists cases_resident_id_idx on public.cases (resident_id);
create index if not exists cases_reported_at_idx on public.cases (reported_at desc);

create index if not exists case_attachments_case_id_idx on public.case_attachments (case_id);
create index if not exists case_notes_case_id_idx on public.case_notes (case_id);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) - Strict Confidentiality Compliance
-- Only authorized Administrators and Social Workers can access case records.
-- Encoders, Health Workers, Responders, and Residents are strictly blocked.
-- -----------------------------------------------------------------------------
alter table public.cases enable row level security;
alter table public.case_attachments enable row level security;
alter table public.case_notes enable row level security;

-- Policies for public.cases
create policy "cases_select_authorized"
on public.cases
for select
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "cases_insert_authorized"
on public.cases
for insert
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "cases_update_authorized"
on public.cases
for update
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
)
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "cases_delete_admin_only"
on public.cases
for delete
using (
  public.current_user_is_active()
  and public.is_admin()
);

-- Policies for public.case_attachments
create policy "case_attachments_select_authorized"
on public.case_attachments
for select
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "case_attachments_insert_authorized"
on public.case_attachments
for insert
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "case_attachments_delete_authorized"
on public.case_attachments
for delete
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

-- Policies for public.case_notes
create policy "case_notes_select_authorized"
on public.case_notes
for select
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "case_notes_insert_authorized"
on public.case_notes
for insert
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

create policy "case_notes_update_authorized"
on public.case_notes
for update
using (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
)
with check (
  public.current_user_is_active()
  and coalesce(public.current_user_role(), '') in ('admin', 'social_worker')
);

-- -----------------------------------------------------------------------------
-- 7. Automatic timestamp trigger for updated_at
-- -----------------------------------------------------------------------------
create or replace function public.update_cases_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_cases_updated_at on public.cases;
create trigger set_cases_updated_at
  before update on public.cases
  for each row
  execute function public.update_cases_timestamp();

commit;
