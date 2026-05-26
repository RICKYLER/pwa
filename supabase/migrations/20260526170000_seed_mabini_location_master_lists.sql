with seeded_barangays (barangay_id, barangay_name) as (
  values
    ('anitapan', 'Anitapan'),
    ('cabuyuan', 'Cabuyuan'),
    ('cadunan', 'Cadunan'),
    ('cuambog', 'Cuambog'),
    ('del-pilar', 'Del Pilar'),
    ('golden-valley', 'Golden Valley'),
    ('libodon', 'Libodon'),
    ('pangibiran', 'Pangibiran'),
    ('pindasan', 'Pindasan'),
    ('san-antonio', 'San Antonio'),
    ('tagnanan', 'Tagnanan')
)
update public.location_master_lists as existing
set
  municipality = 'Mabini',
  barangay_name = seeded_barangays.barangay_name,
  updated_at = timezone('utc', now())
from seeded_barangays
where existing.barangay_id = seeded_barangays.barangay_id;

with seeded_barangays (barangay_id, barangay_name) as (
  values
    ('anitapan', 'Anitapan'),
    ('cabuyuan', 'Cabuyuan'),
    ('cadunan', 'Cadunan'),
    ('cuambog', 'Cuambog'),
    ('del-pilar', 'Del Pilar'),
    ('golden-valley', 'Golden Valley'),
    ('libodon', 'Libodon'),
    ('pangibiran', 'Pangibiran'),
    ('pindasan', 'Pindasan'),
    ('san-antonio', 'San Antonio'),
    ('tagnanan', 'Tagnanan')
)
insert into public.location_master_lists (
  id,
  barangay_id,
  municipality,
  barangay_name,
  puroks,
  updated_at,
  updated_by
)
select
  seeded_barangays.barangay_id,
  seeded_barangays.barangay_id,
  'Mabini',
  seeded_barangays.barangay_name,
  '{}'::text[],
  timezone('utc', now()),
  null
from seeded_barangays
where not exists (
  select 1
  from public.location_master_lists existing
  where existing.barangay_id = seeded_barangays.barangay_id
);
