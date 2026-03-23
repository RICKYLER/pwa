import 'server-only';

import type {
  Household,
  InventoryItem,
  InventoryMovementType,
  Resident,
  User,
} from '@/lib/db/schema';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import {
  mirrorAppUserToSupabase,
  mirrorStoredUserIdToSupabase,
} from '@/lib/server/supabase-user-mirror';

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

function toOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getRemoteActorId(user: User) {
  const remoteActorId = await mirrorAppUserToSupabase(user, {
    emailConfirmed: Boolean(user.email_verified_at || !user.email_verification_required),
  });

  if (!remoteActorId) {
    throw new Error('Failed to mirror the authenticated user to Supabase.');
  }

  return remoteActorId;
}

async function resolveRemoteUserId(localUserId: string | null | undefined, fallback?: string | null) {
  const normalized = toOptionalString(localUserId);
  if (!normalized) {
    return fallback ?? null;
  }

  if (isUuid(normalized)) {
    return normalized;
  }

  return (await mirrorStoredUserIdToSupabase(normalized)) ?? fallback ?? null;
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
  const { data, error } = await supabase.rpc('create_household_bundle', {
    p_household: remoteHousehold,
    p_members: members,
    p_actor_role: user.role,
    p_actor_user_id: remoteActorId,
    p_actor_barangay_id: user.barangay_id,
  });

  if (error) {
    throw new Error(error.message);
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

export async function createInventoryItemOnServer(
  user: User,
  item: Omit<InventoryItem, 'syncStatus'> & { id: string },
) {
  const supabase = getSupabaseAdminClient();
  const remoteActorId = await getRemoteActorId(user);
  const { data, error } = await supabase.rpc('create_inventory_item_bundle', {
    p_item: item,
    p_actor_role: user.role,
    p_actor_user_id: remoteActorId,
  });

  if (error) {
    throw new Error(error.message);
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
  const { data, error } = await supabase.rpc('apply_inventory_transaction_bundle', {
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
    throw new Error(error.message);
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
