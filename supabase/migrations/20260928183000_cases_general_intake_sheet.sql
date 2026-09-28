begin;

-- =============================================================================
-- Migration: MSWDO Cases General Intake Sheet & Case Classification Update
-- 1. Updates case_type check constraint to include 'acts_of_lasciviousness'.
-- 2. Adds JSONB column 'intake_sheet' to public.cases for the standardized 2-page
--    MSWDO General Intake Sheet (identifying info, family members, financial profile,
--    agricultural profile, clinical narratives, prioritization, and signatures).
-- 3. Adds a GIN index on public.cases(intake_sheet) for high-performance JSON queries.
-- =============================================================================

-- 1. Update public.cases case_type constraint to include 'acts_of_lasciviousness'
alter table public.cases drop constraint if exists cases_case_type_check;

alter table public.cases
  add constraint cases_case_type_check
  check (
    case_type in (
      'vawc_physical',
      'vawc_psychological',
      'vawc_sexual',
      'vawc_economic',
      'vac_abuse',
      'vac_neglect',
      'vac_exploitation',
      'rape',
      'acts_of_lasciviousness',
      'cicl',
      'other'
    )
  );

-- 2. Add intake_sheet JSONB column to public.cases if not exists
alter table public.cases
  add column if not exists intake_sheet jsonb default null;

comment on column public.cases.intake_sheet is
  'Standardized MSWDO General Intake Sheet (GIS) storing client category, sector tags, detailed identifying demographics, 10-row family composition, household monthly expenses, agricultural profile, 4 clinical narratives (Problem Presented, Family Background, Assessment, Recommendation), case priority rank, and signatory metadata.';

-- 3. High-performance GIN index for search and analytical filtering across intake sheet JSON
create index if not exists cases_intake_sheet_gin_idx
  on public.cases using gin (intake_sheet);

commit;
