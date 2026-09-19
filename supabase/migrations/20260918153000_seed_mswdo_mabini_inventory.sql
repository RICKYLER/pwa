-- Seed MSWDO Mabini Relief Inventory Stockpile (MDRRMO Bodega)
-- Based on MSWDO Mabini Head specifications:
-- 2,000 Family Food Packs buffer, 3 families per HH allocation rule, and disaster contingency items.

do $$
declare
  v_ffp_id text := 'inv_mswdo_ffp_001';
  v_kit_id text := 'inv_mswdo_kit_001';
  v_hyg_id text := 'inv_mswdo_hyg_001';
  v_slp_id text := 'inv_mswdo_slp_001';
  v_wat_id text := 'inv_mswdo_wat_001';
  v_inf_id text := 'inv_mswdo_inf_001';
  v_sen_id text := 'inv_mswdo_sen_001';
begin

  -- 1. Insert or Update Inventory Items
  insert into public.inventory_items (
    id,
    item_code,
    item_name,
    category,
    quantity_available,
    unit,
    reorder_level,
    storage_location,
    expiration_date,
    notes,
    status,
    sync_status
  )
  values
    (
      v_ffp_id,
      'REL-FFP-001',
      'DSWD / LGU Family Food Pack',
      'food',
      2000,
      'pack',
      500,
      'MDRRMO Bodega',
      (current_date + interval '6 months')::date,
      'Prepositioned stockpile in MDRRMO Bodega. Standard 6kg rice, canned sardines/corned beef, coffee. Rule: 1 pack per family (3 packs per HH). Source: DSWD FO-XI Augmentation / LGU QRF',
      'active',
      'synced'
    ),
    (
      v_kit_id,
      'REL-KIT-001',
      'Standard Kitchen / Cooking Set',
      'other',
      350,
      'pcs',
      100,
      'MDRRMO Bodega',
      null,
      'Cooking pans, utensils, plates, and cups. Allocation: 1 set per physical household. Source: LGU Calamity Buffer',
      'active',
      'synced'
    ),
    (
      v_hyg_id,
      'REL-HYG-001',
      'Family Hygiene Kit',
      'hygiene',
      500,
      'pack',
      150,
      'MDRRMO Bodega',
      (current_date + interval '18 months')::date,
      'Toothbrushes, toothpaste, bath and laundry soap, sanitary napkins. Source: DSWD FO-XI Augmentation',
      'active',
      'synced'
    ),
    (
      v_slp_id,
      'REL-SLP-001',
      'Sleeping Kit (Mat, Blanket, Mosquito Net)',
      'blankets',
      400,
      'bundle',
      100,
      'MDRRMO Bodega',
      null,
      'Sleeping mats, thermal blankets, and treated mosquito nets for evacuation centers. Source: LGU Quick Response Fund',
      'active',
      'synced'
    ),
    (
      v_wat_id,
      'REL-WAT-001',
      'Drinking Water Container (5 Gallons)',
      'other',
      600,
      'pcs',
      150,
      'MDRRMO Bodega',
      (current_date + interval '12 months')::date,
      'Potable purified water container with sealed dispenser cap. Source: Provincial Relief Aid',
      'active',
      'synced'
    ),
    (
      v_inf_id,
      'REL-INF-001',
      'Infant & Toddler Care Kit',
      'other',
      250,
      'pack',
      50,
      'MDRRMO Bodega',
      (current_date + interval '10 months')::date,
      'Infant diapers, baby cereal/Cerelac, feeding bottles, sanitizing wipes. Source: MSWDO Special Care',
      'active',
      'synced'
    ),
    (
      v_sen_id,
      'REL-SEN-001',
      'Senior Citizen Wellness & Nutrition Kit',
      'medicine',
      350,
      'pack',
      75,
      'MDRRMO Bodega',
      (current_date + interval '12 months')::date,
      'Adult nutrition milk supplements, basic multivitamins, rubbing alcohol, liniment. Source: MSWDO Special Care',
      'active',
      'synced'
    )
  on conflict (item_code) do update
  set
    item_name = excluded.item_name,
    category = excluded.category,
    quantity_available = excluded.quantity_available,
    unit = excluded.unit,
    reorder_level = excluded.reorder_level,
    storage_location = excluded.storage_location,
    expiration_date = excluded.expiration_date,
    notes = excluded.notes,
    status = 'active',
    sync_status = 'synced';

  -- 2. Insert Initial Stock-In Movement Ledger for Provenance Tracking
  insert into public.inventory_movements (
    id,
    item_id,
    item_name,
    type,
    quantity,
    previous_quantity,
    new_quantity,
    unit,
    reference_type,
    notes,
    timestamp,
    sync_status
  )
  select
    format('mov_mswdo_init_%s', item.id),
    item.id,
    item.item_name,
    'stock_in',
    item.quantity_available,
    0,
    item.quantity_available,
    item.unit,
    'inventory',
    format('Initial MSWDO Mabini relief stockpile established at %s', coalesce(item.storage_location, 'MDRRMO Bodega')),
    timezone('utc', now()),
    'synced'
  from public.inventory_items item
  where item.item_code in (
    'REL-FFP-001',
    'REL-KIT-001',
    'REL-HYG-001',
    'REL-SLP-001',
    'REL-WAT-001',
    'REL-INF-001',
    'REL-SEN-001'
  )
  and not exists (
    select 1
    from public.inventory_movements m
    where m.item_id = item.id
      and m.type = 'stock_in'
      and m.reference_type = 'inventory'
  );

  -- 3. Preconfigure Standard Relief Package Template in public.package_templates
  insert into public.package_templates (
    id,
    name,
    description,
    items,
    created_at,
    updated_at,
    sync_status
  )
  values (
    'tmpl_mswdo_ffp_standard',
    'DSWD / LGU Standard Family Food Pack',
    'Standard relief pack distributed to displaced families during calamity response. Rule: 1 pack per family (3 packs per typical multi-family household).',
    jsonb_build_array(
      jsonb_build_object(
        'item_id', v_ffp_id,
        'item_name', 'DSWD / LGU Family Food Pack',
        'category', 'food',
        'quantity', 1,
        'unit', 'pack'
      )
    ),
    timezone('utc', now()),
    timezone('utc', now()),
    'synced'
  )
  on conflict (id) do update
  set
    name = excluded.name,
    description = excluded.description,
    items = excluded.items,
    updated_at = timezone('utc', now()),
    sync_status = 'synced';

end $$;
