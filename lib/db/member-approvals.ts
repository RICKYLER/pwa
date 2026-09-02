import type { AuditLog, Gender, Household, Resident, VulnerabilityFlags } from './schema';
import { db, STORE_NAMES } from './indexeddb';
import { getHouseholds } from './households';
import { getResidents } from './residents';
import { getCurrentVulnerabilityFlagsMapForResidents } from './vulnerability';
import { isResidentActiveApprovedHousehold } from '@/lib/resident-households';

export interface PendingMemberApproval {
  resident: Resident;
  household: Household;
  /**
   * The member's vulnerability/health flags as they stand today. These carry the
   * health fields from the add-member form (pregnancy, PWD) that the resident
   * submitted — the admin sees exactly what the form collected. Optional so the
   * pure selector stays testable without IndexedDB.
   */
  flags?: VulnerabilityFlags;
}

export type MemberApprovalDecision = 'approved' | 'rejected';

/**
 * Leader-facing summary of the household a reviewed member belongs to. Surfaced
 * in the history so an admin can always tell *who* the household leader is and
 * how to reach them — the member alone is not enough context.
 */
export interface MemberApprovalHouseholdSummary {
  id: string;
  headName: string;
  location: string;
  contactNumber?: string;
  applicantEmail?: string;
}

/**
 * One resolved entry in the member-approval history: a member a resident added
 * that an admin has since approved or rejected.
 */
export interface MemberApprovalHistoryEntry {
  /** Stable dedupe identity: `${decision}:${residentId}`. */
  key: string;
  residentId: string;
  memberName: string;
  relationship?: string;
  birthdate?: string;
  gender?: Gender;
  decision: MemberApprovalDecision;
  /** Milliseconds since epoch; 0 when the decision time is unknown. */
  decidedAt: number;
  reason?: string;
  household: MemberApprovalHouseholdSummary | null;
}

function toHouseholdSummary(household: Household): MemberApprovalHouseholdSummary {
  return {
    id: household.id,
    headName: household.head_name,
    location: [household.purok_sitio, household.street_address].filter(Boolean).join(' · '),
    contactNumber: household.contact_number?.trim() || undefined,
    applicantEmail: household.applicant_email?.trim() || undefined,
  };
}

function toTimestamp(value: unknown): number {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  return 0;
}

/** The household head registers as `relationship_to_head: 'Self'` — not an added member. */
function isHeadRelationship(relationship: string | undefined | null): boolean {
  return (relationship ?? '').trim().toLowerCase() === 'self';
}

/**
 * Options shared by the member-approval selectors.
 */
export interface MemberApprovalQueryOptions {
  /**
   * Cap the number of returned entries after sorting. Useful at scale to bound
   * how many households/residents/audit logs are materialized into the UI;
   * defaults to no limit.
   */
  limit?: number;
}

function applyLimit<T>(entries: T[], limit?: number): T[] {
  if (typeof limit !== 'number' || limit < 0) {
    return entries;
  }
  return entries.slice(0, Math.floor(limit));
}

/**
 * Pure selector: the household members an admin still needs to review.
 *
 * A pending approval is an active resident whose verification is still
 * `pending` and who belongs to an active, approved household (a member a
 * resident added to their own household). Household heads are excluded —
 * they register with the household and are covered by its location review.
 * Results are sorted by household head name, then member name, so the queue
 * can group them deterministically.
 *
 * `flagsByResidentId` (when provided) is attached to each approval so the admin
 * can review the health details the member's form collected.
 *
 * Kept pure (no IndexedDB) so it can be unit-tested; {@link getPendingMemberApprovals}
 * is the local-store-backed wrapper.
 */
export function selectPendingMemberApprovals(
  households: Household[],
  residents: Resident[],
  flagsByResidentId?: Map<string, VulnerabilityFlags>,
  options?: MemberApprovalQueryOptions,
): PendingMemberApproval[] {
  const approvedHouseholdsById = new Map<string, Household>();
  households.forEach((household) => {
    if (isResidentActiveApprovedHousehold(household)) {
      approvedHouseholdsById.set(household.id, household);
    }
  });

  const approvals: PendingMemberApproval[] = [];
  residents.forEach((resident) => {
    if (resident.status !== 'active' || resident.verification_status !== 'pending') {
      return;
    }

    // The head registers with the household and is covered by its location
    // review — they are never an "added member" awaiting approval.
    if (isHeadRelationship(resident.relationship_to_head)) {
      return;
    }

    const household = approvedHouseholdsById.get(resident.household_id);
    if (!household) {
      return;
    }

    approvals.push({
      resident,
      household,
      flags: flagsByResidentId?.get(resident.id),
    });
  });

  const sorted = approvals.sort((left, right) => {
    const byHousehold = left.household.head_name.localeCompare(right.household.head_name);
    if (byHousehold !== 0) {
      return byHousehold;
    }
    return left.resident.full_name.localeCompare(right.resident.full_name);
  });

  return applyLimit(sorted, options?.limit);
}

/**
 * Load pending member approvals from the local store, including each member's
 * current vulnerability flags so the admin can review the health details
 * collected on the add-member form.
 */
export async function getPendingMemberApprovals(
  options?: MemberApprovalQueryOptions,
): Promise<PendingMemberApproval[]> {
  const [households, residents] = await Promise.all([
    getHouseholds(),
    getResidents({ status: 'active' }),
  ]);

  const flagsByResidentId = await getCurrentVulnerabilityFlagsMapForResidents(residents, households);

  return selectPendingMemberApprovals(households, residents, flagsByResidentId, options);
}

/** Extract the REJECT audit log's human-readable payload, if present. */
function readRejectAuditChanges(log: AuditLog | undefined) {
  const changes = (log?.changes ?? {}) as Record<string, unknown>;
  const memberName = typeof changes.member_name === 'string' ? changes.member_name.trim() : '';
  const householdId = typeof changes.household_id === 'string' ? changes.household_id : null;
  const reason = typeof changes.reason === 'string' ? changes.reason.trim() : '';
  return { memberName, householdId, reason };
}

/**
 * Pure selector: the history of members an admin has already decided on.
 *
 * Two decision sources feed the result:
 *  - **approved** — an active, `verified`, non-head member in an active approved
 *    household. Approvals leave the resident row in place, so residents are the
 *    source of truth. The decision time is proxied by `updatedAt` (there is no
 *    dedicated verified-at column).
 *  - **rejected** — a resident row whose `status` is `rejected` (soft-deleted
 *    when the admin rejected the member). The row is the source of truth for the
 *    member's details; the `reason` comes from the matching `REJECT` audit log.
 *    For legacy members rejected before soft-deletes existed, the resident row
 *    is gone, so the entry is reconstructed from the `REJECT` audit log's
 *    `changes` payload instead.
 *
 * Entries are deduplicated by decision key (`approved:<id>` / `rejected:<id>`)
 * and sorted most-recent decision first. Kept pure (no IndexedDB) so it can be
 * unit-tested; {@link getMemberApprovalHistory} is the store-backed wrapper.
 */
export function selectMemberApprovalHistory(
  households: Household[],
  residents: Resident[],
  auditLogs: AuditLog[],
  options?: MemberApprovalQueryOptions,
): MemberApprovalHistoryEntry[] {
  const householdsById = new Map(households.map((household) => [household.id, household]));
  const approvedHouseholdIds = new Set(
    households.filter(isResidentActiveApprovedHousehold).map((household) => household.id),
  );

  const byKey = new Map<string, MemberApprovalHistoryEntry>();

  // REJECT audit logs indexed by resident id, for attaching reject reasons to
  // tombstoned rows and for reconstructing legacy hard-deleted members.
  const rejectLogByResidentId = new Map<string, AuditLog>();
  auditLogs.forEach((log) => {
    if (log.entity_type !== 'resident' || log.action !== 'REJECT') {
      return;
    }
    if (!rejectLogByResidentId.has(log.entity_id)) {
      rejectLogByResidentId.set(log.entity_id, log);
    }
  });

  // Approved members — resident rows are the source of truth.
  residents.forEach((resident) => {
    if (resident.status !== 'active' || resident.verification_status !== 'verified') {
      return;
    }
    if (!approvedHouseholdIds.has(resident.household_id)) {
      return;
    }
    if (isHeadRelationship(resident.relationship_to_head)) {
      return;
    }

    const household = householdsById.get(resident.household_id);
    byKey.set(`approved:${resident.id}`, {
      key: `approved:${resident.id}`,
      residentId: resident.id,
      memberName: resident.full_name,
      relationship: resident.relationship_to_head || undefined,
      birthdate: resident.birthdate,
      gender: resident.gender,
      decision: 'approved',
      decidedAt: toTimestamp(resident.updatedAt),
      household: household ? toHouseholdSummary(household) : null,
    });
  });

  // Rejected members whose resident row survived (soft-delete). The row carries
  // the member's details; the REJECT audit log supplies the reason.
  residents.forEach((resident) => {
    if (resident.status !== 'rejected') {
      return;
    }
    if (isHeadRelationship(resident.relationship_to_head)) {
      return;
    }

    const household = householdsById.get(resident.household_id);
    const { reason } = readRejectAuditChanges(rejectLogByResidentId.get(resident.id));
    byKey.set(`rejected:${resident.id}`, {
      key: `rejected:${resident.id}`,
      residentId: resident.id,
      memberName: resident.full_name,
      relationship: resident.relationship_to_head || undefined,
      birthdate: resident.birthdate,
      gender: resident.gender,
      decision: 'rejected',
      decidedAt: toTimestamp(resident.updatedAt),
      reason: reason || undefined,
      household: household ? toHouseholdSummary(household) : null,
    });
  });

  // Legacy rejected members (hard-deleted before soft-deletes existed). Only the
  // audit log survives; skip any resident id already covered by a tombstone.
  auditLogs.forEach((log) => {
    if (log.entity_type !== 'resident' || log.action !== 'REJECT') {
      return;
    }
    if (byKey.has(`rejected:${log.entity_id}`)) {
      return;
    }

    const { memberName, householdId, reason } = readRejectAuditChanges(log);
    const household = householdId ? householdsById.get(householdId) : undefined;
    byKey.set(`rejected:${log.entity_id}`, {
      key: `rejected:${log.entity_id}`,
      residentId: log.entity_id,
      memberName: memberName || 'A household member',
      decision: 'rejected',
      decidedAt: toTimestamp(log.timestamp),
      reason: reason || undefined,
      household: household ? toHouseholdSummary(household) : null,
    });
  });

  const sorted = Array.from(byKey.values()).sort((left, right) => right.decidedAt - left.decidedAt);
  return applyLimit(sorted, options?.limit);
}

/**
 * Load the member-approval history (approved + rejected) from the local store.
 */
export async function getMemberApprovalHistory(
  options?: MemberApprovalQueryOptions,
): Promise<MemberApprovalHistoryEntry[]> {
  const [households, residents, auditLogs] = await Promise.all([
    getHouseholds(),
    getResidents({ status: ['active', 'rejected'] }),
    db.getAll<AuditLog>(STORE_NAMES.audit_logs),
  ]);

  return selectMemberApprovalHistory(households, residents, auditLogs, options);
}
