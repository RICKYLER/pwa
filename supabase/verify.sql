-- Run this after schema.sql if you want to confirm everything was created.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'users',
    'location_master_lists',
    'households',
    'residents',
    'vulnerability_flags',
    'programs',
    'beneficiaries',
    'inventory_items',
    'inventory_movements',
    'package_templates',
    'distribution_events',
    'distribution_records',
    'incidents',
    'audit_logs',
    'sync_backups'
  )
order by table_name;

select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'users',
    'households',
    'residents',
    'vulnerability_flags',
    'inventory_items',
    'distribution_events',
    'incidents'
  )
order by tablename;
