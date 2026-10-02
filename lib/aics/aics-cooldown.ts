import type { AicsRecord } from '@/lib/db/schema';

/**
 * Standard DSWD / MSWDO AICS Policy:
 * Beneficiaries who receive crisis financial assistance are subject to a
 * 3-Month (90-day) cooldown period before being eligible for another
 * regular assistance grant, preventing duplicate disbursements while ensuring fair allocation.
 */
export const AICS_COOLDOWN_DAYS = 90;

export interface AicsCooldownInfo {
  status: 'cooldown' | 'eligible';
  isUnderCooldown: boolean;
  lastDisbursedDate: string | null;
  lastAmount: number | null;
  lastAssistanceType: string | null;
  lastControlNumber: string | null;
  daysElapsed: number;
  daysRemaining: number;
  nextEligibleDate: string | null;
  badgeLabel: string;
  badgeLabelCeb: string;
  explanation: string;
  explanationCeb: string;
}

/**
 * Check whether an AICS record counts towards the disbursement cooldown.
 * Includes records that are approved, disbursed, or liquidated.
 */
export function isDisbursedOrApprovedAicsRecord(record: Partial<AicsRecord>): boolean {
  if (record.is_deleted) return false;
  return (
    record.status === 'disbursed' ||
    record.status === 'liquidated' ||
    record.status === 'approved'
  );
}

/**
 * Calculate the 90-day (3-month) cooldown status for a beneficiary from their past records.
 */
export function computeAicsCooldown(
  records: Array<Partial<AicsRecord>>,
  referenceDate: Date = new Date(),
): AicsCooldownInfo {
  const eligibleRecords = records
    .filter(isDisbursedOrApprovedAicsRecord)
    .sort((a, b) => {
      const timeA = new Date(a.disbursed_at || a.intake_date || a.createdAt || 0).getTime();
      const timeB = new Date(b.disbursed_at || b.intake_date || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

  if (eligibleRecords.length === 0) {
    return {
      status: 'eligible',
      isUnderCooldown: false,
      lastDisbursedDate: null,
      lastAmount: null,
      lastAssistanceType: null,
      lastControlNumber: null,
      daysElapsed: 0,
      daysRemaining: 0,
      nextEligibleDate: null,
      badgeLabel: 'Eligible for Assistance',
      badgeLabelCeb: 'Pwede Makadawat og Hinabang',
      explanation: 'No prior AICS assistance on record. Beneficiary is fully eligible.',
      explanationCeb: 'Wala pay rekord nga nakadawat og hinabang kaniadto. Pwede makadawat.',
    };
  }

  const latest = eligibleRecords[0];
  const dateStr = latest.disbursed_at || latest.intake_date || (latest.createdAt as string) || '';
  const latestDate = new Date(dateStr);
  const validDate = isNaN(latestDate.getTime()) ? new Date() : latestDate;

  const diffMs = referenceDate.getTime() - validDate.getTime();
  const daysElapsed = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, AICS_COOLDOWN_DAYS - daysElapsed);
  const isUnderCooldown = daysRemaining > 0;

  const nextEligibleDateObj = new Date(validDate.getTime() + AICS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const nextEligibleDate = nextEligibleDateObj.toISOString().split('T')[0];

  const formattedLastDate = validDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedNextDate = nextEligibleDateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedAmount = latest.amount_approved
    ? `₱${Number(latest.amount_approved).toLocaleString()}`
    : 'financial aid';

  if (isUnderCooldown) {
    return {
      status: 'cooldown',
      isUnderCooldown: true,
      lastDisbursedDate: dateStr,
      lastAmount: latest.amount_approved ?? null,
      lastAssistanceType: latest.assistance_type ?? null,
      lastControlNumber: latest.control_number ?? null,
      daysElapsed,
      daysRemaining,
      nextEligibleDate,
      badgeLabel: `Cooldown: ${daysRemaining}d left`,
      badgeLabelCeb: `Bag-o Pa Nakadawat (${daysRemaining}d nahabilin)`,
      explanation: `Received ${formattedAmount} on ${formattedLastDate}. Eligible again on ${formattedNextDate} (${daysRemaining} days remaining).`,
      explanationCeb: `Nakadawat og ${formattedAmount} niadtong ${formattedLastDate}. Pwede na usab makadawat karong ${formattedNextDate} (${daysRemaining} ka adlaw nahabilin).`,
    };
  }

  return {
    status: 'eligible',
    isUnderCooldown: false,
    lastDisbursedDate: dateStr,
    lastAmount: latest.amount_approved ?? null,
    lastAssistanceType: latest.assistance_type ?? null,
    lastControlNumber: latest.control_number ?? null,
    daysElapsed,
    daysRemaining: 0,
    nextEligibleDate: null,
    badgeLabel: 'Eligible for New Claim',
    badgeLabelCeb: 'Pwede na Makadawat Pag-usab',
    explanation: `Last assistance was on ${formattedLastDate} (${daysElapsed} days ago). 3-month cooldown completed.`,
    explanationCeb: `Ang katapusang hinabang nadawat niadtong ${formattedLastDate} (${daysElapsed} ka adlaw na ang milabay). Tapos na ang 3 ka buwan nga cooldown.`,
  };
}
