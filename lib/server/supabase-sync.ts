import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SyncQueueItem, User } from '@/lib/db/schema';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';
import { resolveSupabaseUserId } from '@/lib/server/supabase-user-ids';

const SYNC_AGENT_EMAIL = 'sync-agent@mswdo.local';
const SYNC_AGENT_NAME = 'MSWDO Sync Agent';
const DEFAULT_BARANGAY_ID = 'barangay-1';

const SUPPORTED_ENTITY_TYPES = [
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
  'location_master_lists',
  'audit_logs',
] as const;

type SupportedEntityType = (typeof SUPPORTED_ENTITY_TYPES)[number];

const CONFLICT_GUARDED_ENTITY_TYPES = new Set<SupportedEntityType>([
  'households',
  'residents',
  'vulnerability_flags',
  'programs',
  'beneficiaries',
  'inventory_items',
  'package_templates',
  'distribution_events',
  'incidents',
  'location_master_lists',
]);

type SyncFailure = {
  id: string;
  entity_type: string;
  entity_id: string;
  error: string;
};

type SyncResult = {
  appliedCount: number;
  syncedItems: Array<{
    id: string;
    client_timestamp: string;
  }>;
  failedItems: SyncFailure[];
  updatedAt: string;
};

const UPSERT_ORDER: SupportedEntityType[] = [
  'location_master_lists',
  'programs',
  'households',
  'inventory_items',
  'package_templates',
  'residents',
  'vulnerability_flags',
  'beneficiaries',
  'inventory_movements',
  'incidents',
  'distribution_events',
  'distribution_records',
  'audit_logs',
];

let syncActorIdPromise: Promise<string> | null = null;

function isSupportedEntityType(value: string): value is SupportedEntityType {
  return (SUPPORTED_ENTITY_TYPES as readonly string[]).includes(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toRequiredString(value: unknown, fieldName: string) {
  const normalized = toOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
}

function toOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRequiredNumber(value: unknown, fieldName: string) {
  const normalized = toOptionalNumber(value);
  if (normalized === null) {
    throw new Error(`${fieldName} must be a valid number.`);
  }
  return normalized;
}

function toBooleanValue(value: unknown, defaultValue = false) {
  return typeof value === 'boolean' ? value : defaultValue;
}

function toDateOnly(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

function toTimestamp(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function toOptionalUuid(value: unknown) {
  return isUuid(value) ? value : null;
}

function toTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim()))
    .filter(Boolean);
}

function normalizeDistributedItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const item = entry as Record<string, unknown>;
      const itemId = toOptionalString(item.item_id);
      const quantity = toOptionalNumber(item.quantity);
      if (!itemId || quantity === null) return null;

      return {
        item_id: itemId,
        quantity,
        item_name: toOptionalString(item.item_name),
        unit: toOptionalString(item.unit),
      };
    })
    .filter(Boolean);
}

function normalizeJsonValue(value: unknown) {
  if (value === undefined) return null;
  return value;
}

function extractConflictGuard(data: Record<string, unknown>) {
  return {
    baseUpdatedAt: toOptionalString(data.__base_updated_at),
    baseRecordVersion: toOptionalNumber(data.__base_record_version),
  };
}

async function resolveAuditLogUserId(value: unknown, syncActorId: string) {
  const localUserId = toOptionalString(value);
  if (!localUserId) {
    return syncActorId;
  }

  return (await resolveSupabaseUserId(localUserId, syncActorId)) ?? syncActorId;
}

async function mapQueueItemToSupabaseRow(item: SyncQueueItem, syncActorId: string) {
  if (!item.data || typeof item.data !== 'object') {
    throw new Error('Queued item data is missing.');
  }

  const data = item.data as Record<string, unknown>;
  const syncStatus = 'synced';

  switch (item.entity_type) {
    case 'households':
      return {
        id: toRequiredString(data.id, 'household.id'),
        head_name: toRequiredString(data.head_name, 'household.head_name'),
        head_id: toOptionalString(data.head_id),
        barangay_id: toRequiredString(data.barangay_id, 'household.barangay_id'),
        applicant_user_id: toOptionalUuid(data.applicant_user_id),
        applicant_email: toOptionalString(data.applicant_email),
        barangay_name: toOptionalString(data.barangay_name),
        municipality: toOptionalString(data.municipality),
        purok_sitio: toRequiredString(data.purok_sitio, 'household.purok_sitio'),
        street_address: toRequiredString(data.street_address, 'household.street_address'),
        landmark_directions: toOptionalString(data.landmark_directions),
        contact_number: toOptionalString(data.contact_number),
        supporting_document_name: toOptionalString(data.supporting_document_name),
        supporting_document_type: toOptionalString(data.supporting_document_type),
        supporting_document_data: toOptionalString(data.supporting_document_data),
        status: toRequiredString(data.status, 'household.status'),
        gps_lat: toOptionalNumber(data.gps_lat),
        gps_long: toOptionalNumber(data.gps_long),
        location_source: toOptionalString(data.location_source),
        location_confidence: toOptionalString(data.location_confidence),
        location_verified: toBooleanValue(data.location_verified),
        location_verified_at: toTimestamp(data.location_verified_at),
        location_verified_by: toOptionalUuid(data.location_verified_by),
        registration_status: toOptionalString(data.registration_status) ?? 'pending',
        registration_submitted_at: toTimestamp(data.registration_submitted_at),
        registration_reviewed_at: toTimestamp(data.registration_reviewed_at),
        registration_reviewed_by: toOptionalUuid(data.registration_reviewed_by),
        registration_review_notes: toOptionalString(data.registration_review_notes),
        pin_qa_status: toOptionalString(data.pin_qa_status) ?? 'needs_verification',
        pin_qa_notes: toOptionalString(data.pin_qa_notes),
        created_at: toTimestamp(data.createdAt),
        updated_at: toTimestamp(data.updatedAt),
        sync_status: syncStatus,
      };
    case 'residents':
      return {
        id: toRequiredString(data.id, 'resident.id'),
        household_id: toRequiredString(data.household_id, 'resident.household_id'),
        full_name: toRequiredString(data.full_name, 'resident.full_name'),
        birthdate: toDateOnly(data.birthdate),
        gender: toRequiredString(data.gender, 'resident.gender'),
        relationship_to_head: toRequiredString(data.relationship_to_head, 'resident.relationship_to_head'),
        status: toRequiredString(data.status, 'resident.status'),
        civil_status: toOptionalString(data.civil_status),
        occupation: toOptionalString(data.occupation),
        income_level: toOptionalString(data.income_level),
        contact_number: toOptionalString(data.contact_number),
        created_at: toTimestamp(data.createdAt),
        updated_at: toTimestamp(data.updatedAt),
        sync_status: syncStatus,
      };
    case 'vulnerability_flags':
      return {
        id: toRequiredString(data.id, 'vulnerability_flags.id'),
        resident_id: toRequiredString(data.resident_id, 'vulnerability_flags.resident_id'),
        is_child: toBooleanValue(data.is_child),
        is_adult: toBooleanValue(data.is_adult),
        is_senior: toBooleanValue(data.is_senior),
        is_pregnant: toBooleanValue(data.is_pregnant),
        is_pwd: toBooleanValue(data.is_pwd),
        pwd_type: toOptionalString(data.pwd_type),
        has_chronic_illness: toBooleanValue(data.has_chronic_illness),
        chronic_conditions: toTextArray(data.chronic_conditions),
        is_low_income: toBooleanValue(data.is_low_income),
        notes: toOptionalString(data.notes),
        updated_at: toTimestamp(data.updatedAt),
        sync_status: syncStatus,
      };
    case 'programs':
      return {
        id: toRequiredString(data.id, 'program.id'),
        name: toRequiredString(data.name, 'program.name'),
        description: toOptionalString(data.description),
        active: toBooleanValue(data.active, true),
        created_at: toTimestamp(data.createdAt),
      };
    case 'beneficiaries':
      return {
        id: toRequiredString(data.id, 'beneficiary.id'),
        program_id: toRequiredString(data.program_id, 'beneficiary.program_id'),
        resident_id: toRequiredString(data.resident_id, 'beneficiary.resident_id'),
        enrollment_date: toDateOnly(data.enrollment_date),
        status: toOptionalString(data.status) ?? 'active',
        sync_status: syncStatus,
      };
    case 'inventory_items':
      return {
        id: toRequiredString(data.id, 'inventory_item.id'),
        item_name: toRequiredString(data.item_name, 'inventory_item.item_name'),
        item_code: toOptionalString(data.item_code),
        category: toRequiredString(data.category, 'inventory_item.category'),
        quantity_available: toRequiredNumber(data.quantity_available, 'inventory_item.quantity_available'),
        unit: toRequiredString(data.unit, 'inventory_item.unit'),
        reorder_level: toOptionalNumber(data.reorder_level),
        storage_location: toOptionalString(data.storage_location),
        expiration_date: toDateOnly(data.expiration_date),
        notes: toOptionalString(data.notes),
        sync_status: syncStatus,
      };
    case 'inventory_movements':
      return {
        id: toRequiredString(data.id, 'inventory_movement.id'),
        item_id: toRequiredString(data.item_id, 'inventory_movement.item_id'),
        item_name: toRequiredString(data.item_name, 'inventory_movement.item_name'),
        type: toRequiredString(data.type, 'inventory_movement.type'),
        quantity: toRequiredNumber(data.quantity, 'inventory_movement.quantity'),
        previous_quantity: toRequiredNumber(data.previous_quantity, 'inventory_movement.previous_quantity'),
        new_quantity: toRequiredNumber(data.new_quantity, 'inventory_movement.new_quantity'),
        unit: toRequiredString(data.unit, 'inventory_movement.unit'),
        performed_by: toOptionalUuid(data.performed_by),
        performed_by_name: toOptionalString(data.performed_by_name),
        reference_id: toOptionalString(data.reference_id),
        reference_type: toOptionalString(data.reference_type),
        notes: toOptionalString(data.notes),
        timestamp: toTimestamp(data.timestamp),
        sync_status: syncStatus,
      };
    case 'package_templates':
      return {
        id: toRequiredString(data.id, 'package_template.id'),
        name: toRequiredString(data.name, 'package_template.name'),
        description: toOptionalString(data.description),
        items: normalizeJsonValue(normalizeDistributedItems(data.items)),
        created_at: toTimestamp(data.createdAt),
        updated_at: toTimestamp(data.updatedAt),
        sync_status: syncStatus,
      };
    case 'distribution_events':
      return {
        id: toRequiredString(data.id, 'distribution_event.id'),
        event_name: toRequiredString(data.event_name, 'distribution_event.event_name'),
        type: toRequiredString(data.type, 'distribution_event.type'),
        incident_id: toOptionalString(data.incident_id),
        target_scope: toRequiredString(data.target_scope, 'distribution_event.target_scope'),
        target_group: toRequiredString(data.target_group, 'distribution_event.target_group'),
        package_items: normalizeJsonValue(normalizeDistributedItems(data.package_items)),
        location: toRequiredString(data.location, 'distribution_event.location'),
        gps_lat: toOptionalNumber(data.gps_lat),
        gps_lng: toOptionalNumber(data.gps_lng),
        scheduled_date: toDateOnly(data.scheduled_date),
        status: toRequiredString(data.status, 'distribution_event.status'),
        created_by: toOptionalUuid(data.created_by) ?? syncActorId,
        notes: toOptionalString(data.notes),
        sync_status: syncStatus,
      };
    case 'distribution_records':
      return {
        id: toRequiredString(data.id, 'distribution_record.id'),
        event_id: toRequiredString(data.event_id, 'distribution_record.event_id'),
        household_id: toOptionalString(data.household_id),
        resident_id: toOptionalString(data.resident_id),
        beneficiary_name: toOptionalString(data.beneficiary_name),
        items_distributed: normalizeJsonValue(normalizeDistributedItems(data.items_distributed)),
        received_by_name: toOptionalString(data.received_by_name),
        timestamp: toTimestamp(data.timestamp),
        distributor_id: toOptionalUuid(data.distributor_id) ?? syncActorId,
        notes: toOptionalString(data.notes),
        sync_status: syncStatus,
      };
    case 'incidents':
      return {
        id: toRequiredString(data.id, 'incident.id'),
        type: toRequiredString(data.type, 'incident.type'),
        location: toRequiredString(data.location, 'incident.location'),
        gps_lat: toOptionalNumber(data.gps_lat),
        gps_lng: toOptionalNumber(data.gps_lng),
        severity: toRequiredString(data.severity, 'incident.severity'),
        status: toRequiredString(data.status, 'incident.status'),
        reported_by: toOptionalUuid(data.reported_by) ?? syncActorId,
        reported_at: toTimestamp(data.reported_at),
        photo_url: toOptionalString(data.photo_url),
        description: toRequiredString(data.description, 'incident.description'),
        sync_status: syncStatus,
      };
    case 'location_master_lists':
      return {
        id: toRequiredString(data.id, 'location_master_list.id'),
        barangay_id: toRequiredString(data.barangay_id, 'location_master_list.barangay_id'),
        municipality: toRequiredString(data.municipality, 'location_master_list.municipality'),
        barangay_name: toRequiredString(data.barangay_name, 'location_master_list.barangay_name'),
        puroks: toTextArray(data.puroks),
        updated_at: toTimestamp(data.updatedAt),
        updated_by: toOptionalUuid(data.updatedBy),
      };
    case 'audit_logs':
      return {
        id: toRequiredString(data.id, 'audit_log.id'),
        user_id: await resolveAuditLogUserId(data.user_id, syncActorId),
        action: toRequiredString(data.action, 'audit_log.action'),
        entity_type: toRequiredString(data.entity_type, 'audit_log.entity_type'),
        entity_id: toRequiredString(data.entity_id, 'audit_log.entity_id'),
        changes: normalizeJsonValue(data.changes),
        timestamp: toTimestamp(data.timestamp),
      };
    default:
      throw new Error(`Unsupported sync entity type: ${item.entity_type}`);
  }
}

async function ensureSyncActorId() {
  if (!syncActorIdPromise) {
    syncActorIdPromise = (async () => {
      const supabase = getSupabaseAdminClient();

      const { data: existingProfiles, error: existingProfilesError } = await supabase
        .from('users')
        .select('id')
        .eq('email', SYNC_AGENT_EMAIL)
        .limit(1);

      if (existingProfilesError) {
        throw new Error(`Failed to check sync actor profile: ${existingProfilesError.message}`);
      }

      const existingProfileId = existingProfiles?.[0]?.id;
      if (existingProfileId && isUuid(existingProfileId)) {
        return existingProfileId;
      }

      const { data: authUsers, error: authUsersError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });

      if (authUsersError) {
        throw new Error(`Failed to list auth users: ${authUsersError.message}`);
      }

      let syncActorId = authUsers.users.find((entry) => entry.email?.toLowerCase() === SYNC_AGENT_EMAIL)?.id;

      if (!syncActorId) {
        const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
          email: SYNC_AGENT_EMAIL,
          password: randomUUID(),
          email_confirm: true,
          user_metadata: {
            name: SYNC_AGENT_NAME,
            role: 'admin',
            barangay_id: DEFAULT_BARANGAY_ID,
          },
        });

        if (createUserError || !createdUser.user?.id) {
          throw new Error(createUserError?.message || 'Failed to create sync actor.');
        }

        syncActorId = createdUser.user.id;
      }

      const { error: upsertProfileError } = await supabase
        .from('users')
        .upsert({
          id: syncActorId,
          email: SYNC_AGENT_EMAIL,
          name: SYNC_AGENT_NAME,
          role: 'admin',
          barangay_id: DEFAULT_BARANGAY_ID,
          must_change_password: false,
          email_verification_required: false,
          email_verified_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (upsertProfileError) {
        throw new Error(`Failed to upsert sync actor profile: ${upsertProfileError.message}`);
      }

      return syncActorId;
    })().catch((error) => {
      syncActorIdPromise = null;
      throw error;
    });
  }

  return syncActorIdPromise;
}

function compareSyncItems(left: SyncQueueItem, right: SyncQueueItem) {
  const leftIsDelete = left.operation === 'delete';
  const rightIsDelete = right.operation === 'delete';

  if (leftIsDelete !== rightIsDelete) {
    return leftIsDelete ? 1 : -1;
  }

  const leftOrder = isSupportedEntityType(left.entity_type)
    ? UPSERT_ORDER.indexOf(left.entity_type)
    : Number.MAX_SAFE_INTEGER;
  const rightOrder = isSupportedEntityType(right.entity_type)
    ? UPSERT_ORDER.indexOf(right.entity_type)
    : Number.MAX_SAFE_INTEGER;

  if (leftIsDelete && rightIsDelete) {
    return rightOrder - leftOrder;
  }

  return leftOrder - rightOrder;
}

async function applySyncItem(item: SyncQueueItem, syncActorId: string) {
  if (!isSupportedEntityType(item.entity_type)) {
    throw new Error(`Unsupported sync entity type: ${item.entity_type}`);
  }

  const supabase = getSupabaseAdminClient();
  const rawData =
    item.data && typeof item.data === 'object'
      ? item.data as Record<string, unknown>
      : {};
  const conflictGuard = extractConflictGuard(rawData);
  const canUseConflictGuard = CONFLICT_GUARDED_ENTITY_TYPES.has(item.entity_type);

  if (item.operation === 'delete') {
    let query = supabase
      .from(item.entity_type)
      .delete()
      .eq('id', item.entity_id);

    if (canUseConflictGuard) {
      if (conflictGuard.baseRecordVersion !== null) {
        query = query.eq('record_version', conflictGuard.baseRecordVersion);
      } else if (conflictGuard.baseUpdatedAt) {
        query = query.eq('updated_at', conflictGuard.baseUpdatedAt);
      }
    }

    const { data, error } = await query
      .select('id');

    if (error) {
      throw new Error(error.message);
    }

    if (canUseConflictGuard && (!Array.isArray(data) || data.length === 0)) {
      throw new Error(`Conflict detected while deleting ${item.entity_type}:${item.entity_id}. Refresh before retrying.`);
    }

    return;
  }

  const payload = await mapQueueItemToSupabaseRow(item, syncActorId);
  if (item.operation === 'create') {
    const { error } = await supabase
      .from(item.entity_type)
      .insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { id: _id, ...updatePayload } = payload;
  let query = supabase
    .from(item.entity_type)
    .update(updatePayload)
    .eq('id', item.entity_id);

  if (canUseConflictGuard) {
    if (conflictGuard.baseRecordVersion !== null) {
      query = query.eq('record_version', conflictGuard.baseRecordVersion);
    } else if (conflictGuard.baseUpdatedAt) {
      query = query.eq('updated_at', conflictGuard.baseUpdatedAt);
    }
  }

  const { data, error } = await query
    .select('id');

  if (error) {
    throw new Error(error.message);
  }

  if (!Array.isArray(data) || data.length === 0) {
    if (canUseConflictGuard) {
      throw new Error(`Conflict detected while updating ${item.entity_type}:${item.entity_id}. Refresh before retrying.`);
    }

    throw new Error(`${item.entity_type}:${item.entity_id} no longer exists in Supabase.`);
  }
}

async function writeRemoteSyncBackups(items: SyncQueueItem[], syncActorId: string) {
  if (!items.length) return;

  const supabase = getSupabaseAdminClient();
  const syncedAt = new Date().toISOString();
  const backupRows = items.map((item) => ({
    queue_id: item.id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    operation: item.operation,
    data: normalizeJsonValue(item.data),
    client_timestamp: toTimestamp(item.timestamp) ?? new Date().toISOString(),
    synced_at: syncedAt,
    synced_by: syncActorId,
  }));

  const { error } = await supabase
    .from('sync_backups')
    .upsert(backupRows, {
      onConflict: 'queue_id',
    });

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncQueueItemsToSupabase(items: SyncQueueItem[], _user: User): Promise<SyncResult> {
  const updatedAt = new Date().toISOString();

  if (!items.length) {
    return {
      appliedCount: 0,
      syncedItems: [],
      failedItems: [],
      updatedAt,
    };
  }

  const syncActorId = await ensureSyncActorId();
  const orderedItems = [...items].sort(compareSyncItems);
  const appliedItems: SyncQueueItem[] = [];
  const failedItems: SyncFailure[] = [];

  for (const item of orderedItems) {
    try {
      await applySyncItem(item, syncActorId);
      appliedItems.push(item);
    } catch (error) {
      failedItems.push({
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        error: error instanceof Error ? error.message : 'Supabase sync failed.',
      });
    }
  }

  if (appliedItems.length > 0) {
    await writeRemoteSyncBackups(appliedItems, syncActorId);
  }

  return {
    appliedCount: appliedItems.length,
    syncedItems: appliedItems.map((item) => ({
      id: item.id,
      client_timestamp: toTimestamp(item.timestamp) ?? new Date().toISOString(),
    })),
    failedItems,
    updatedAt,
  };
}
