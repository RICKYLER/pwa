import { createAuditLog } from '@/lib/auth';
import type { VulnerabilityFlags } from '@/lib/db/schema';

/**
 * Whether a member's health/vulnerability flags contain data that should be
 * treated as sensitive — pregnancy, disability, chronic illness, or medical
 * notes. Used to decide when an admin's view of a record should be audited.
 */
export function hasSensitiveHealthData(flags?: Partial<VulnerabilityFlags> | null): boolean {
  if (!flags) {
    return false;
  }
  if (flags.is_pregnant) {
    return true;
  }
  if (flags.is_pwd) {
    return true;
  }
  if (flags.has_chronic_illness) {
    return true;
  }
  if (flags.chronic_conditions && flags.chronic_conditions.length > 0) {
    return true;
  }
  if (flags.medical_notes && flags.medical_notes.trim()) {
    return true;
  }
  return false;
}

/**
 * Record that an admin viewed a resident's sensitive health details, so access
 * to protected data is auditable.
 *
 * Fire-and-forget: failures are logged, never thrown, so auditing can never
 * block the UI that triggered it.
 */
export function logSensitiveDataView(entityId: string): void {
  void createAuditLog('VIEW', 'resident', entityId, {
    scope: 'vulnerability_flags',
    detail: 'Admin expanded member details containing sensitive health fields.',
  });
}
