import 'server-only';

import type {
  DistributionEvent,
  Household,
  Incident,
  InventoryItem,
  InventoryMovementType,
  LocationMasterList,
  PackageTemplate,
  Resident,
  User,
} from '@/lib/db/schema';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { requireSupabaseUserId, resolveSupabaseUserId } from '@/lib/server/supabase-user-ids';

type HouseholdMemberDraft = {
  full_name: string;
  birthdate: string;
  gender: 'M' | 'F';
  relationship_to_head: string;
  civil_status?: string;
  occupation?: string;
  income_level?: string;
  is_pregnant?: boolean;
  is_pwd?: boolean;
  pwd_type?: string;
  has_chronic_illness?: boolean;
  chronic_conditions?: string[];
};

type InventoryTransactionParams = {
  item_id: string;
  type: InventoryMovementType;
  quantity: number;
  next_quantity?: number;
  notes?: string;
  reference_id?: string;
  reference_type?: 'inventory' | 'distribution' | 'manual' | 'transfer';
  expected_record_version?: number;
};

type ReleaseDistributionParams = {
  event_id: string;
  household_id?: string;
  resident_id?: string;
  received_by_name?: string;
  notes?: string;
};

type RemoteHouseholdBundleInput = Omit<
  Household,
  'createdAt' | 'updatedAt' | 'syncStatus' | 'applicant_user_id' | 'location_verified_by' | 'registration_reviewed_by'
> & {
  id: string;
  applicant_user_id?: string | null;
  location_verified_by?: string | null;
  registration_reviewed_by?: string | null;
};

function toOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function toDateOnlyString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

function toTextArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim()))
    .filter(Boolean);
}

function getAgeFromBirthdate(birthdate: string) {
  const parsed = new Date(`${birthdate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return 0;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - parsed.getUTCMonth();
  const dayDelta = today.getUTCDate() - parsed.getUTCDate();

  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function buildVulnerabilityFlagsPayload(residentId: string, member: HouseholdMemberDraft) {
  const birthdate = toDateOnlyString(member.birthdate) ?? new Date().toISOString().slice(0, 10);
  const age = getAgeFromBirthdate(birthdate);
  const category = age < 18 ? 'child' : age < 60 ? 'adult' : 'senior';

  return {
    resident_id: residentId,
    is_child: age < 18,
    is_adult: age >= 18 && age < 60,
    is_senior: age >= 60,
    is_pregnant: Boolean(member.is_pregnant),
    is_pwd: Boolean(member.is_pwd),
    pwd_type: member.is_pwd ? toOptionalString(member.pwd_type) : null,
    has_chronic_illness: Boolean(member.has_chronic_illness),
    chronic_conditions: toTextArray(member.chronic_conditions),
    is_low_income: member.income_level === 'low',
    notes: `Auto-categorized as ${category} (age ${age}) on ${new Date().toISOString().slice(0, 10)}`,
    sync_status: 'synced',
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

function referencesInventoryItem(
  items: unknown,
  itemId: string,
) {
  if (!Array.isArray(items)) {
    return false;
  }

  return items.some((entry) =>
    Boolean(
      entry
      && typeof entry === 'object'
      && 'item_id' in entry
      && (entry as { item_id?: unknown }).item_id === itemId,
    ),
  );
}

function isMissingRpcFunctionError(
  error: { code?: string | null; message?: string | null } | null | undefined,
  functionName: string,
) {
  if (!error) {
    return false;
  }

  const message = error.message ?? '';
  return (
    error.code === 'PGRST202'
    || (
      message.includes(functionName)
      && message.toLowerCase().includes('schema cache')
    )
  );
}

function isMissingInventoryTrashSchemaError(
  error: { code?: string | null; message?: string | null } | null | undefined,
) {
  if (!error) {
    return false;
  }

  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('inventory_items')
    && message.includes('status')
    && (
      message.includes('schema cache')
      || message.includes('does not exist')
      || message.includes('could not find')
    )
  );
}

async function getRemoteActorId(user: User) {
  return requireSupabaseUserId(user);
}

async function resolveRemoteUserId(localUserId: string | null | undefined, fallback?: string | null) {
  const normalized = toOptionalString(localUserId);
  if (!normalized) {
    return fallback ?? null;
  }

  return resolveSupabaseUserId(normalized, fallback);
}

async function createAuditLogEntry(params: {
  user: User;
  action: string;
  entityType: 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user' | 'location_master';
  entityId: string;
  changes?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(params.user);
  const { error } = await supabase
    .from('audit_logs')
    .insert({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      user_id: remoteActorId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      changes: params.changes ?? null,
      timestamp: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to create audit log: ${error.message}`);
  }
}

async function createInventoryItemWithoutRpc(
  user: User,
  item: Omit<InventoryItem, 'syncStatus'> & { id: string },
  remoteActorId: string,
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to manage inventory.');
  }

  const supabase = getSupabaseAdminClient();
  const quantityAvailable =
    typeof item.quantity_available === 'number' && Number.isFinite(item.quantity_available)
      ? Math.max(0, item.quantity_available)
      : 0;
  const reorderLevel =
    typeof item.reorder_level === 'number' && Number.isFinite(item.reorder_level)
      ? Math.max(0, item.reorder_level)
      : 10;

  const { data: createdItem, error: createItemError } = await supabase
    .from('inventory_items')
    .insert({
      id: item.id,
      item_name: item.item_name.trim(),
      item_code: toOptionalString(item.item_code),
      category: item.category,
      quantity_available: quantityAvailable,
      unit: item.unit,
      reorder_level: reorderLevel,
      storage_location: toOptionalString(item.storage_location),
      expiration_date: toOptionalString(item.expiration_date),
      notes: toOptionalString(item.notes),
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (createItemError) {
    throw new Error(createItemError.message);
  }

  const movements: Array<Record<string, unknown>> = [];
  if (createdItem && quantityAvailable > 0) {
    const { data: createdMovement, error: createMovementError } = await supabase
      .from('inventory_movements')
      .insert({
        id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        item_id: createdItem.id,
        item_name: createdItem.item_name,
        type: 'stock_in',
        quantity: quantityAvailable,
        previous_quantity: 0,
        new_quantity: quantityAvailable,
        unit: createdItem.unit,
        performed_by: remoteActorId,
        performed_by_name: toOptionalString(user.name),
        reference_id: createdItem.id,
        reference_type: 'inventory',
        notes: 'Opening stock',
        timestamp: new Date().toISOString(),
        sync_status: 'synced',
      })
      .select('*')
      .single();

    if (createMovementError) {
      await supabase
        .from('inventory_items')
        .delete()
        .eq('id', createdItem.id);

      throw new Error(createMovementError.message);
    }

    if (createdMovement) {
      movements.push(createdMovement);
    }
  }

  return {
    inventory_item: createdItem,
    inventory_item_id: createdItem?.id ?? item.id,
    inventory_movements: movements,
  };
}

async function applyInventoryTransactionWithoutRpc(
  user: User,
  params: InventoryTransactionParams,
  remoteActorId: string,
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to manage inventory.');
  }

  if (!['stock_in', 'stock_out', 'adjustment', 'distribution_release', 'transfer'].includes(params.type)) {
    throw new Error('Unsupported inventory transaction type.');
  }

  const supabase = getSupabaseAdminClient();
  const itemId = toOptionalString(params.item_id);
  const quantity =
    typeof params.quantity === 'number' && Number.isFinite(params.quantity)
      ? Math.max(params.quantity, 0)
      : 0;

  if (!itemId) {
    throw new Error('Inventory item not found.');
  }

  if (params.type !== 'adjustment' && quantity <= 0) {
    throw new Error('Transaction quantity must be greater than zero.');
  }

  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', itemId)
    .single();

  if (itemError) {
    throw new Error(itemError.message);
  }

  if (!item) {
    throw new Error('Inventory item not found.');
  }

  if (item.status === 'trashed') {
    throw new Error('Restore this item from Trash before updating its stock.');
  }

  const currentQuantity =
    typeof item.quantity_available === 'number' && Number.isFinite(item.quantity_available)
      ? item.quantity_available
      : Math.max(Number(item.quantity_available ?? 0) || 0, 0);
  const currentRecordVersion =
    typeof item.record_version === 'number' && Number.isFinite(item.record_version)
      ? item.record_version
      : null;

  if (
    typeof params.expected_record_version === 'number'
    && currentRecordVersion !== null
    && currentRecordVersion !== params.expected_record_version
  ) {
    throw new Error('Conflict detected while updating inventory. Refresh before retrying.');
  }

  if (
    ['stock_out', 'distribution_release', 'transfer'].includes(params.type)
    && currentQuantity < quantity
  ) {
    throw new Error('Not enough stock for this transaction.');
  }

  const explicitNextQuantity =
    typeof params.next_quantity === 'number' && Number.isFinite(params.next_quantity)
      ? Math.max(params.next_quantity, 0)
      : null;
  const nextQuantity = explicitNextQuantity ?? (
    params.type === 'stock_in'
      ? currentQuantity + quantity
      : Math.max(currentQuantity - quantity, 0)
  );
  const movementQuantity =
    params.type === 'adjustment'
      ? Math.abs(nextQuantity - currentQuantity)
      : quantity;

  let updateQuery = supabase
    .from('inventory_items')
    .update({
      quantity_available: nextQuantity,
      sync_status: 'synced',
    })
    .eq('id', itemId);

  if (
    typeof params.expected_record_version === 'number'
    && currentRecordVersion !== null
  ) {
    updateQuery = updateQuery.eq('record_version', params.expected_record_version);
  }

  const { data: updatedItems, error: updateError } = await updateQuery
    .select('*');

  if (updateError) {
    throw new Error(updateError.message);
  }

  const updatedItem = Array.isArray(updatedItems) ? updatedItems[0] : null;
  if (!updatedItem) {
    throw new Error('Conflict detected while updating inventory. Refresh before retrying.');
  }

  const { data: createdMovement, error: createMovementError } = await supabase
    .from('inventory_movements')
    .insert({
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      item_id: updatedItem.id,
      item_name: updatedItem.item_name,
      type: params.type,
      quantity: movementQuantity,
      previous_quantity: currentQuantity,
      new_quantity: nextQuantity,
      unit: updatedItem.unit,
      performed_by: remoteActorId,
      performed_by_name: toOptionalString(user.name),
      reference_id: toOptionalString(params.reference_id),
      reference_type: toOptionalString(params.reference_type),
      notes: toOptionalString(params.notes),
      timestamp: new Date().toISOString(),
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (createMovementError) {
    await supabase
      .from('inventory_items')
      .update({
        quantity_available: currentQuantity,
        sync_status: 'synced',
      })
      .eq('id', itemId);

    throw new Error(createMovementError.message);
  }

  return {
    inventory_item: updatedItem,
    inventory_item_id: updatedItem.id,
    inventory_movement: createdMovement ?? undefined,
  };
}

async function createHouseholdBundleWithoutRpc(
  user: User,
  household: RemoteHouseholdBundleInput,
  members: HouseholdMemberDraft[],
  remoteActorId: string,
) {
  if (!['admin', 'encoder', 'resident'].includes(user.role)) {
    throw new Error('You are not allowed to create households.');
  }

  const barangayId = toOptionalString(household.barangay_id);
  if (!barangayId) {
    throw new Error('Household barangay_id is required.');
  }

  if (user.role === 'encoder' && user.barangay_id !== barangayId) {
    throw new Error('You can only create households inside your barangay.');
  }

  if (user.role === 'resident' && toOptionalString(household.applicant_user_id) !== remoteActorId) {
    throw new Error('Residents can only create their own household registrations.');
  }

  const supabase = getSupabaseAdminClient();
  const householdPayload = stripUndefined({
    id: toOptionalString(household.id),
    head_name: toOptionalString(household.head_name) ?? '',
    head_id: toOptionalString(household.head_id),
    barangay_id: barangayId,
    applicant_user_id: toOptionalString(household.applicant_user_id),
    applicant_email: toOptionalString(household.applicant_email),
    barangay_name: toOptionalString(household.barangay_name),
    municipality: toOptionalString(household.municipality),
    purok_sitio: toOptionalString(household.purok_sitio) ?? '',
    street_address: toOptionalString(household.street_address) ?? '',
    landmark_directions: toOptionalString(household.landmark_directions),
    contact_number: toOptionalString(household.contact_number),
    supporting_document_name: toOptionalString(household.supporting_document_name),
    supporting_document_type: toOptionalString(household.supporting_document_type),
    supporting_document_data: toOptionalString(household.supporting_document_data),
    status: household.status ?? 'active',
    gps_lat: typeof household.gps_lat === 'number' ? household.gps_lat : undefined,
    gps_long: typeof household.gps_long === 'number' ? household.gps_long : undefined,
    location_source: household.location_source,
    location_confidence: household.location_confidence,
    location_verified: Boolean(household.location_verified),
    location_verified_at: toIsoString(household.location_verified_at),
    location_verified_by: toOptionalString(household.location_verified_by),
    registration_status: household.registration_status ?? 'pending',
    registration_submitted_at: toIsoString(household.registration_submitted_at),
    registration_reviewed_at: toIsoString(household.registration_reviewed_at),
    registration_reviewed_by: toOptionalString(household.registration_reviewed_by),
    registration_review_notes: toOptionalString(household.registration_review_notes),
    pin_qa_status: household.pin_qa_status ?? 'needs_verification',
    pin_qa_notes: toOptionalString(household.pin_qa_notes),
    sync_status: 'synced',
  });

  const { data: createdHousehold, error: householdError } = await supabase
    .from('households')
    .insert(householdPayload)
    .select('*')
    .single();

  if (householdError) {
    throw new Error(householdError.message);
  }

  if (!createdHousehold) {
    throw new Error('Household could not be created.');
  }

  const createdResidents: Array<Record<string, unknown>> = [];
  const createdFlags: Array<Record<string, unknown>> = [];

  try {
    for (const member of members) {
      const residentPayload = stripUndefined({
        household_id: createdHousehold.id,
        full_name: toOptionalString(member.full_name) ?? '',
        birthdate: toDateOnlyString(member.birthdate) ?? new Date().toISOString().slice(0, 10),
        gender: member.gender === 'F' ? 'F' : 'M',
        relationship_to_head: toOptionalString(member.relationship_to_head) ?? '',
        status: 'active',
        civil_status: toOptionalString(member.civil_status),
        occupation: toOptionalString(member.occupation),
        income_level: toOptionalString(member.income_level),
        sync_status: 'synced',
      });

      const { data: createdResident, error: residentError } = await supabase
        .from('residents')
        .insert(residentPayload)
        .select('*')
        .single();

      if (residentError) {
        throw new Error(residentError.message);
      }

      if (!createdResident) {
        throw new Error('Resident could not be created.');
      }

      createdResidents.push(createdResident);

      const { data: createdFlag, error: flagsError } = await supabase
        .from('vulnerability_flags')
        .upsert(buildVulnerabilityFlagsPayload(createdResident.id, member), {
          onConflict: 'resident_id',
        })
        .select('*')
        .single();

      if (flagsError) {
        throw new Error(flagsError.message);
      }

      if (createdFlag) {
        createdFlags.push(createdFlag);
      }
    }
  } catch (error) {
    await supabase
      .from('households')
      .delete()
      .eq('id', createdHousehold.id);

    throw error;
  }

  return {
    household: createdHousehold,
    household_id: createdHousehold.id,
    residents: createdResidents,
    vulnerability_flags: createdFlags,
  };
}

export async function createAuditLogOnServer(params: {
  user: User;
  action: string;
  entityType: 'household' | 'resident' | 'distribution' | 'incident' | 'inventory' | 'user' | 'location_master';
  entityId: string;
  changes?: Record<string, unknown>;
}) {
  await createAuditLogEntry(params);
}

export async function createHouseholdBundleOnServer(
  user: User,
  household: Omit<Household, 'createdAt' | 'updatedAt' | 'syncStatus'> & { id: string },
  members: HouseholdMemberDraft[],
) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const remoteHousehold = {
    ...household,
    applicant_user_id: await resolveRemoteUserId(
      household.applicant_user_id,
      user.role === 'resident' ? remoteActorId : null,
    ),
    location_verified_by: await resolveRemoteUserId(household.location_verified_by),
    registration_reviewed_by: await resolveRemoteUserId(household.registration_reviewed_by),
  };
  let data: unknown = null;
  const { data: rpcData, error } = await supabase.rpc('create_household_bundle', {
    p_household: remoteHousehold,
    p_members: members,
    p_actor_role: user.role,
    p_actor_user_id: remoteActorId,
    p_actor_barangay_id: user.barangay_id,
  });

  if (error) {
    if (isMissingRpcFunctionError(error, 'create_household_bundle')) {
      data = await createHouseholdBundleWithoutRpc(user, remoteHousehold, members, remoteActorId);
    } else {
      throw new Error(error.message);
    }
  } else {
    data = rpcData;
  }

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'household',
    entityId: household.id,
    changes: {
      household_name: household.head_name,
      purok: household.purok_sitio,
      members_count: members.length,
    },
  });

  return data;
}

export async function createResidentOnServer(
  user: User,
  resident: Omit<Resident, 'createdAt' | 'updatedAt' | 'syncStatus'> & { id: string },
) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('create_resident_bundle', {
    p_resident: resident,
    p_actor_role: user.role,
    p_actor_barangay_id: user.barangay_id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'resident',
    entityId: resident.id,
    changes: {
      name: resident.full_name,
      birthdate: resident.birthdate,
      household_id: resident.household_id,
    },
  });

  return data;
}

export async function updateResidentOnServer(
  user: User,
  residentId: string,
  updates: Partial<Resident> & {
    is_pregnant?: boolean;
    is_pwd?: boolean;
    pwd_type?: string;
    has_chronic_illness?: boolean;
    chronic_conditions?: string[];
  },
) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('update_resident_bundle', {
    p_resident_id: residentId,
    p_updates: updates,
    p_actor_role: user.role,
    p_actor_barangay_id: user.barangay_id,
  });

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'resident',
    entityId: residentId,
    changes: updates as Record<string, unknown>,
  });

  return data;
}

export async function updateResidentHealthFlagsOnServer(
  user: User,
  residentId: string,
  updates: {
    is_pregnant?: boolean;
    is_pwd?: boolean;
    pwd_type?: string;
    has_chronic_illness?: boolean;
    chronic_conditions?: string[];
  },
) {
  if (!['admin', 'encoder', 'health_worker'].includes(user.role)) {
    throw new Error('You are not allowed to update resident health flags.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, household_id')
    .eq('id', residentId)
    .limit(1)
    .single();

  if (residentError) {
    throw new Error(residentError.message);
  }

  if (!resident) {
    throw new Error('Resident not found.');
  }

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('id, barangay_id')
    .eq('id', resident.household_id)
    .limit(1)
    .single();

  if (householdError) {
    throw new Error(householdError.message);
  }

  if (!household) {
    throw new Error('Resident household not found.');
  }

  if (
    user.role !== 'admin'
    && household.barangay_id !== user.barangay_id
  ) {
    throw new Error('You can only manage residents inside your barangay.');
  }

  const { error: refreshError } = await supabase.rpc('refresh_vulnerability_flags_for_resident', {
    p_resident_id: residentId,
  });

  if (refreshError) {
    throw new Error(refreshError.message);
  }

  const payload = stripUndefined({
    is_pregnant: typeof updates.is_pregnant === 'boolean' ? updates.is_pregnant : undefined,
    is_pwd: typeof updates.is_pwd === 'boolean' ? updates.is_pwd : undefined,
    pwd_type: updates.pwd_type === undefined ? undefined : toOptionalString(updates.pwd_type),
    has_chronic_illness:
      typeof updates.has_chronic_illness === 'boolean' ? updates.has_chronic_illness : undefined,
    chronic_conditions: Array.isArray(updates.chronic_conditions)
      ? updates.chronic_conditions
      : undefined,
    sync_status: 'synced',
  });

  const { data, error } = await supabase
    .from('vulnerability_flags')
    .update(payload)
    .eq('resident_id', residentId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'resident',
    entityId: residentId,
    changes: {
      health_updates: updates,
    },
  });

  return data;
}

export async function createInventoryItemOnServer(
  user: User,
  item: Omit<InventoryItem, 'syncStatus'> & { id: string },
) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  let data: unknown = null;
  const { data: rpcData, error } = await supabase.rpc('create_inventory_item_bundle', {
    p_item: item,
    p_actor_role: user.role,
    p_actor_user_id: remoteActorId,
  });

  if (error) {
    if (isMissingRpcFunctionError(error, 'create_inventory_item_bundle')) {
      data = await createInventoryItemWithoutRpc(user, item, remoteActorId);
    } else {
      throw new Error(error.message);
    }
  } else {
    data = rpcData;
  }

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'inventory',
    entityId: item.id,
    changes: {
      item_name: item.item_name,
      category: item.category,
      quantity: item.quantity_available,
      reorder_level: item.reorder_level,
      storage_location: item.storage_location,
    },
  });

  return data;
}

export async function applyInventoryTransactionOnServer(
  user: User,
  params: InventoryTransactionParams,
) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  let data: unknown = null;
  const { data: rpcData, error } = await supabase.rpc('apply_inventory_transaction_bundle', {
    p_item_id: params.item_id,
    p_type: params.type,
    p_quantity: params.quantity,
    p_next_quantity: params.next_quantity ?? null,
    p_notes: toOptionalString(params.notes),
    p_reference_id: toOptionalString(params.reference_id),
    p_reference_type: toOptionalString(params.reference_type),
    p_actor_role: user.role,
    p_actor_user_id: remoteActorId,
    p_expected_record_version: typeof params.expected_record_version === 'number'
      ? params.expected_record_version
      : null,
  });

  if (error) {
    if (isMissingRpcFunctionError(error, 'apply_inventory_transaction_bundle')) {
      data = await applyInventoryTransactionWithoutRpc(user, params, remoteActorId);
    } else {
      throw new Error(error.message);
    }
  } else {
    data = rpcData;
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'inventory',
    entityId: params.item_id,
    changes: {
      type: params.type,
      quantity: params.quantity,
      next_quantity: params.next_quantity ?? null,
      notes: toOptionalString(params.notes),
      reference_id: toOptionalString(params.reference_id),
      reference_type: toOptionalString(params.reference_type),
    },
  });

  return data;
}

export async function releaseDistributionPackageOnServer(
  user: User,
  params: ReleaseDistributionParams,
) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const { data, error } = await supabase.rpc('release_distribution_package_bundle', {
    p_event_id: params.event_id,
    p_household_id: toOptionalString(params.household_id),
    p_resident_id: toOptionalString(params.resident_id),
    p_received_by_name: toOptionalString(params.received_by_name),
    p_notes: toOptionalString(params.notes),
    p_actor_role: user.role,
    p_actor_user_id: remoteActorId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const distributionRecordId =
    typeof (data as Record<string, unknown> | null)?.distribution_record_id === 'string'
      ? (data as Record<string, unknown>).distribution_record_id as string
      : params.event_id;

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'distribution',
    entityId: distributionRecordId,
    changes: {
      event_id: params.event_id,
      household_id: toOptionalString(params.household_id),
      resident_id: toOptionalString(params.resident_id),
      received_by_name: toOptionalString(params.received_by_name),
    },
  });

  return data;
}

export async function deleteDistributionEventOnServer(
  user: User,
  eventId: string,
) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc('delete_distribution_event_bundle', {
    p_event_id: eventId,
    p_actor_role: user.role,
  });

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'DELETE',
    entityType: 'distribution',
    entityId: eventId,
    changes: {
      event_id: eventId,
    },
  });

  return data;
}

export async function updateHouseholdOnServer(
  user: User,
  householdId: string,
  updates: Partial<Household>,
) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const { data: existing, error: existingError } = await supabase
    .from('households')
    .select('id, barangay_id, applicant_user_id, applicant_email')
    .eq('id', householdId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const current = existing?.[0];
  if (!current) {
    throw new Error(`Household ${householdId} not found`);
  }

  const canAccess =
    user.role === 'admin'
    || (user.role === 'encoder' && current.barangay_id === user.barangay_id)
    || (
      user.role === 'resident'
      && (
        current.applicant_user_id === remoteActorId
        || current.applicant_email === user.email
      )
    );

  if (!canAccess) {
    throw new Error('You are not allowed to update this household.');
  }

  const payload = stripUndefined({
    head_name: typeof updates.head_name === 'string' ? updates.head_name.trim() : undefined,
    head_id: typeof updates.head_id === 'string' ? updates.head_id.trim() || null : undefined,
    applicant_user_id: updates.applicant_user_id === undefined
      ? undefined
      : await resolveRemoteUserId(updates.applicant_user_id, null),
    applicant_email: typeof updates.applicant_email === 'string' ? updates.applicant_email.trim() || null : undefined,
    barangay_name: typeof updates.barangay_name === 'string' ? updates.barangay_name.trim() || null : undefined,
    municipality: typeof updates.municipality === 'string' ? updates.municipality.trim() || null : undefined,
    purok_sitio: typeof updates.purok_sitio === 'string' ? updates.purok_sitio.trim() : undefined,
    street_address: typeof updates.street_address === 'string' ? updates.street_address.trim() : undefined,
    landmark_directions: typeof updates.landmark_directions === 'string' ? updates.landmark_directions.trim() || null : undefined,
    contact_number: typeof updates.contact_number === 'string' ? updates.contact_number.trim() || null : undefined,
    status: updates.status,
    gps_lat: typeof updates.gps_lat === 'number' ? updates.gps_lat : undefined,
    gps_long: typeof updates.gps_long === 'number' ? updates.gps_long : undefined,
    location_source: updates.location_source,
    location_confidence: updates.location_confidence,
    location_verified: typeof updates.location_verified === 'boolean' ? updates.location_verified : undefined,
    location_verified_at: updates.location_verified_at === undefined ? undefined : toIsoString(updates.location_verified_at),
    location_verified_by: updates.location_verified_by === undefined
      ? undefined
      : await resolveRemoteUserId(updates.location_verified_by, null),
    registration_status: updates.registration_status,
    registration_submitted_at: updates.registration_submitted_at === undefined ? undefined : toIsoString(updates.registration_submitted_at),
    registration_reviewed_at: updates.registration_reviewed_at === undefined ? undefined : toIsoString(updates.registration_reviewed_at),
    registration_reviewed_by: updates.registration_reviewed_by === undefined
      ? undefined
      : await resolveRemoteUserId(updates.registration_reviewed_by, null),
    registration_review_notes: typeof updates.registration_review_notes === 'string'
      ? updates.registration_review_notes.trim() || null
      : undefined,
    pin_qa_status: updates.pin_qa_status,
    pin_qa_notes: typeof updates.pin_qa_notes === 'string' ? updates.pin_qa_notes.trim() || null : undefined,
    sync_status: 'synced',
  });

  const { data, error } = await supabase
    .from('households')
    .update(payload)
    .eq('id', householdId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'household',
    entityId: householdId,
    changes: updates as Record<string, unknown>,
  });

  return data;
}

export async function saveLocationMasterListOnServer(
  user: User,
  input: Pick<LocationMasterList, 'barangay_id' | 'municipality' | 'barangay_name' | 'puroks'>,
) {
  if (user.role !== 'admin') {
    throw new Error('Admin access is required to update the master list.');
  }

  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const payload = {
    id: input.barangay_id,
    barangay_id: input.barangay_id,
    municipality: input.municipality.trim(),
    barangay_name: input.barangay_name.trim(),
    puroks: input.puroks,
    updated_at: new Date().toISOString(),
    updated_by: remoteActorId,
  };

  const { data, error } = await supabase
    .from('location_master_lists')
    .upsert(payload, {
      onConflict: 'id',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPSERT',
    entityType: 'location_master',
    entityId: input.barangay_id,
    changes: {
      municipality: input.municipality,
      barangay_name: input.barangay_name,
      puroks: input.puroks,
    },
  });

  return data;
}

export async function createDistributionEventOnServer(
  user: User,
  event: Omit<DistributionEvent, 'syncStatus'> & { id: string },
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to create distribution events.');
  }

  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const { data, error } = await supabase
    .from('distribution_events')
    .insert({
      id: event.id,
      event_name: event.event_name.trim(),
      type: event.type,
      incident_id: typeof event.incident_id === 'string' ? event.incident_id.trim() || null : null,
      target_scope: event.target_scope,
      target_group: event.target_group,
      package_items: event.package_items,
      location: event.location.trim(),
      gps_lat: typeof event.gps_lat === 'number' ? event.gps_lat : null,
      gps_lng: typeof event.gps_lng === 'number' ? event.gps_lng : null,
      scheduled_date: event.scheduled_date,
      status: event.status,
      created_by: remoteActorId,
      notes: typeof event.notes === 'string' ? event.notes.trim() || null : null,
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'distribution',
    entityId: event.id,
    changes: {
      event_name: event.event_name,
      type: event.type,
      location: event.location,
      target_scope: event.target_scope,
      target_group: event.target_group,
      package_items: event.package_items,
    },
  });

  return data;
}

export async function updateDistributionEventOnServer(
  user: User,
  eventId: string,
  updates: Partial<DistributionEvent>,
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to update distribution events.');
  }

  const supabase = getSupabaseAdminClient();
  const payload = stripUndefined({
    event_name: typeof updates.event_name === 'string' ? updates.event_name.trim() : undefined,
    type: updates.type,
    incident_id: typeof updates.incident_id === 'string' ? updates.incident_id.trim() || null : undefined,
    target_scope: updates.target_scope,
    target_group: updates.target_group,
    package_items: Array.isArray(updates.package_items) ? updates.package_items : undefined,
    location: typeof updates.location === 'string' ? updates.location.trim() : undefined,
    gps_lat: typeof updates.gps_lat === 'number' ? updates.gps_lat : undefined,
    gps_lng: typeof updates.gps_lng === 'number' ? updates.gps_lng : undefined,
    scheduled_date: typeof updates.scheduled_date === 'string' ? updates.scheduled_date : undefined,
    status: updates.status,
    notes: typeof updates.notes === 'string' ? updates.notes.trim() || null : undefined,
    sync_status: 'synced',
  });

  const { data, error } = await supabase
    .from('distribution_events')
    .update(payload)
    .eq('id', eventId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'distribution',
    entityId: eventId,
    changes: updates as Record<string, unknown>,
  });

  return data;
}

export async function updateInventoryItemOnServer(
  user: User,
  itemId: string,
  updates: Partial<InventoryItem>,
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to update inventory items.');
  }

  const supabase = getSupabaseAdminClient();
  const payload = stripUndefined({
    item_name: typeof updates.item_name === 'string' ? updates.item_name.trim() : undefined,
    item_code: typeof updates.item_code === 'string' ? updates.item_code.trim() || null : undefined,
    category: updates.category,
    status:
      updates.status === 'active' || updates.status === 'trashed'
        ? updates.status
        : undefined,
    unit: updates.unit,
    reorder_level: typeof updates.reorder_level === 'number' ? updates.reorder_level : undefined,
    storage_location: typeof updates.storage_location === 'string' ? updates.storage_location.trim() || null : undefined,
    expiration_date: typeof updates.expiration_date === 'string' ? updates.expiration_date.trim() || null : undefined,
    notes: typeof updates.notes === 'string' ? updates.notes.trim() || null : undefined,
    sync_status: 'synced',
  });

  const { data, error } = await supabase
    .from('inventory_items')
    .update(payload)
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) {
    if (isMissingInventoryTrashSchemaError(error)) {
      throw new Error(
        'Supabase inventory trash schema is missing. Apply migration 20260402093000_inventory_trash_status.sql, then refresh the schema cache.',
      );
    }
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'inventory',
    entityId: itemId,
    changes: updates as Record<string, unknown>,
  });

  return data;
}

export async function deleteInventoryItemPermanentlyOnServer(
  user: User,
  itemId: string,
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to permanently delete inventory items.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: item, error: itemError } = await supabase
    .from('inventory_items')
    .select('id, item_name, status')
    .eq('id', itemId)
    .single();

  if (itemError) {
    if (isMissingInventoryTrashSchemaError(itemError)) {
      throw new Error(
        'Supabase inventory trash schema is missing. Apply migration 20260402093000_inventory_trash_status.sql, then refresh the schema cache.',
      );
    }
    throw new Error(itemError.message);
  }

  if (!item) {
    throw new Error('Inventory item not found.');
  }

  if (item.status !== 'trashed') {
    throw new Error('Move this item to Trash before permanently deleting it.');
  }

  const [
    packageTemplatesResult,
    distributionEventsResult,
  ] = await Promise.all([
    supabase
      .from('package_templates')
      .select('id, name, items'),
    supabase
      .from('distribution_events')
      .select('id, event_name, package_items'),
  ]);

  const blockingError = packageTemplatesResult.error || distributionEventsResult.error;
  if (blockingError) {
    throw new Error(blockingError.message);
  }

  const blockingTemplates = (packageTemplatesResult.data ?? [])
    .filter((template) => referencesInventoryItem(template.items, itemId))
    .map((template) => template.name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
  const blockingEvents = (distributionEventsResult.data ?? [])
    .filter((event) => referencesInventoryItem(event.package_items, itemId))
    .map((event) => event.event_name)
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0);

  if (blockingTemplates.length > 0 || blockingEvents.length > 0) {
    const references = [
      ...blockingTemplates.slice(0, 2),
      ...blockingEvents.slice(0, 2),
    ];
    const suffix =
      blockingTemplates.length + blockingEvents.length > references.length
        ? ' and more'
        : '';

    throw new Error(
      `This item is still used by ${references.join(', ')}${suffix}. Remove those references before permanently deleting it.`,
    );
  }

  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'DELETE',
    entityType: 'inventory',
    entityId: itemId,
    changes: {
      item_name: item.item_name,
      mode: 'permanent',
    },
  });

  return { item_id: itemId };
}

export async function createPackageTemplateOnServer(
  user: User,
  template: Omit<PackageTemplate, 'syncStatus'> & { id: string },
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to manage package templates.');
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('package_templates')
    .insert({
      id: template.id,
      name: template.name.trim(),
      description: typeof template.description === 'string' ? template.description.trim() || null : null,
      items: template.items,
      created_at: template.createdAt instanceof Date ? template.createdAt.toISOString() : toIsoString(template.createdAt),
      updated_at: template.updatedAt instanceof Date ? template.updatedAt.toISOString() : toIsoString(template.updatedAt),
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'inventory',
    entityId: template.id,
    changes: {
      template_name: template.name,
      items_count: template.items.length,
    },
  });

  return data;
}

export async function deletePackageTemplateOnServer(
  user: User,
  templateId: string,
) {
  if (!['admin', 'encoder'].includes(user.role)) {
    throw new Error('You are not allowed to manage package templates.');
  }

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('package_templates')
    .delete()
    .eq('id', templateId);

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'DELETE',
    entityType: 'inventory',
    entityId: templateId,
    changes: { entity: 'package_template' },
  });
}

export async function createIncidentOnServer(
  user: User,
  incident: Omit<Incident, 'syncStatus'> & { id: string },
) {
  if (!['admin', 'responder'].includes(user.role)) {
    throw new Error('You are not allowed to create incidents.');
  }

  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const { data, error } = await supabase
    .from('incidents')
    .insert({
      id: incident.id,
      type: incident.type,
      location: incident.location.trim(),
      gps_lat: typeof incident.gps_lat === 'number' ? incident.gps_lat : null,
      gps_lng: typeof incident.gps_lng === 'number' ? incident.gps_lng : null,
      severity: incident.severity,
      status: incident.status,
      reported_by: remoteActorId,
      reported_at: toIsoString(incident.reported_at) ?? new Date().toISOString(),
      photo_url: typeof incident.photo_url === 'string' ? incident.photo_url.trim() || null : null,
      description: incident.description.trim(),
      sync_status: 'synced',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'CREATE',
    entityType: 'incident',
    entityId: incident.id,
    changes: {
      type: incident.type,
      severity: incident.severity,
      location: incident.location,
      gps_lat: incident.gps_lat,
      gps_lng: incident.gps_lng,
    },
  });

  return data;
}

export async function updateIncidentStatusOnServer(
  user: User,
  incidentId: string,
  status: Incident['status'],
) {
  if (!['admin', 'responder'].includes(user.role)) {
    throw new Error('You are not allowed to update incidents.');
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from('incidents')
    .select('id, status')
    .eq('id', incidentId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const current = existing?.[0];
  if (!current) {
    throw new Error(`Incident ${incidentId} not found`);
  }

  const { data, error } = await supabase
    .from('incidents')
    .update({
      status,
      sync_status: 'synced',
    })
    .eq('id', incidentId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await createAuditLogEntry({
    user,
    action: 'UPDATE',
    entityType: 'incident',
    entityId: incidentId,
    changes: {
      previous_status: current.status,
      new_status: status,
    },
  });

  return data;
}
