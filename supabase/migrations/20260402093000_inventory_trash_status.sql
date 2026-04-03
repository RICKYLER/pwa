alter table public.inventory_items
  add column if not exists status text not null default 'active';

update public.inventory_items
set status = 'active'
where status is null;

alter table public.inventory_items
  drop constraint if exists inventory_items_status_check;

alter table public.inventory_items
  add constraint inventory_items_status_check
  check (status in ('active', 'trashed'));

create index if not exists inventory_items_status_idx
  on public.inventory_items (status);

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

  if coalesce(v_item.status, 'active') = 'trashed' then
    raise exception 'Restore this item from Trash before updating its stock.';
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

notify pgrst, 'reload schema';
