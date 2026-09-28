begin;

-- =============================================================================
-- Migration: Solo Parents Verification, Document Attachments & Role Permissions
-- Supports client-side compressed physical requirement document uploads,
-- explicit revocation columns, public verification RPC, and social worker roles.
-- =============================================================================

-- 1. Ensure revocation columns exist on public.solo_parents
alter table public.solo_parents
  add column if not exists revocation_reason text,
  add column if not exists revocation_date date;

-- 2. Ensure requirements defaults to empty jsonb and add GIN index
alter table public.solo_parents
  alter column requirements set default '{}'::jsonb;

create index if not exists idx_solo_parents_requirements_gin
  on public.solo_parents using gin (requirements);

-- 3. Update staff RLS policy to include social_worker as well as admin and solo_parent_focal
drop policy if exists "staff_solo_parents_access" on public.solo_parents;
create policy "staff_solo_parents_access"
  on public.solo_parents
  for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'solo_parent_focal', 'social_worker')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and users.role in ('admin', 'solo_parent_focal', 'social_worker')
    )
  );

-- 4. Create secure public verification RPC function for LGU QR scanner verification
-- Allows checking if an ID number is active/valid without exposing sensitive private contact or address
create or replace function public.verify_solo_parent_id(p_id_number text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'found', true,
    'id_number', sp.id_number,
    'full_name', sp.full_name,
    'barangay_id', sp.barangay_id,
    'purok_sitio', sp.purok_sitio,
    'category', sp.category,
    'is_minimum_wage_or_below', sp.is_minimum_wage_or_below,
    'dependents', sp.dependents,
    'issued_at', sp.issued_at,
    'expires_at', sp.expires_at,
    'status', sp.status,
    'revocation_reason', coalesce(sp.revocation_reason, sp.requirements -> '_revocation' ->> 'reason'),
    'revocation_date', coalesce(sp.revocation_date::text, sp.requirements -> '_revocation' ->> 'date')
  )
  into v_result
  from public.solo_parents sp
  where lower(sp.id_number) = lower(trim(p_id_number))
     or lower(sp.id) = lower(trim(p_id_number))
  limit 1;

  if v_result is null then
    return jsonb_build_object('found', false);
  end if;

  return v_result;
end;
$$;

-- Grant execution to anon and authenticated for public QR code verification portal
grant execute on function public.verify_solo_parent_id(text) to anon, authenticated, service_role;

commit;
