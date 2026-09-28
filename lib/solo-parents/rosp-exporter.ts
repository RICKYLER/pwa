import type { SoloParentRecord, SoloParentCategory } from '@/lib/db/schema';
import { getBarangayName } from '@/lib/mabini-barangays';

export const SOLO_PARENT_CATEGORY_LABELS: Record<SoloParentCategory, string> = {
  death_of_spouse: 'Deceased Spouse (Balo)',
  abandonment: 'Abandoned by Spouse (>6 mos)',
  unmarried: 'Unmarried Mother/Father',
  legal_separation: 'Legally/De Facto Separated',
  spouse_detained: 'Spouse Detained/Incarcerated',
  spouse_incapacitated: 'Spouse Incapacitated/PWD',
  other_extenuating: 'Other Extenuating Circumstances',
};

/**
 * Formats a list of solo parent records into CSV for DSWD / MSWDO reporting (ROSP)
 */
export function exportRospCsv(records: SoloParentRecord[]): void {
  const headers = [
    'Solo Parent ID',
    'Full Name',
    'Gender',
    'Civil Status',
    'Birthdate',
    'Age',
    'Contact Number',
    'Barangay',
    'Purok/Sitio',
    'RA 11861 Category',
    'Occupation',
    'Monthly Income (PHP)',
    '1k Subsidy Qualified',
    'Dependents Count',
    'Dependents Details',
    'Date Issued',
    'Date Expired',
    'Status',
  ];

  const rows = records.map((r) => {
    const barangayName = getBarangayName(r.barangay_id);
    const categoryLabel = SOLO_PARENT_CATEGORY_LABELS[r.category] || r.category;
    const subsidyQualified = r.is_minimum_wage_or_below ? 'YES' : 'NO';
    const dependentsStr = r.dependents
      .map((d) => `${d.full_name} (${d.age}y/o - ${d.relationship})`)
      .join('; ');

    return [
      `"${r.id_number || ''}"`,
      `"${r.full_name.replace(/"/g, '""')}"`,
      `"${r.gender || ''}"`,
      `"${r.civil_status || ''}"`,
      `"${r.birthdate || ''}"`,
      r.age ?? '',
      `"${r.contact_number || ''}"`,
      `"${barangayName}"`,
      `"${(r.purok_sitio || '').replace(/"/g, '""')}"`,
      `"${categoryLabel}"`,
      `"${(r.occupation || '').replace(/"/g, '""')}"`,
      r.monthly_income ?? 0,
      `"${subsidyQualified}"`,
      r.dependents.length,
      `"${dependentsStr.replace(/"/g, '""')}"`,
      `"${r.issued_at || ''}"`,
      `"${r.expires_at || ''}"`,
      `"${r.status || 'active'}"`,
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const now = new Date().toISOString().slice(0, 10);
  link.setAttribute('download', `DSWD_ROSP_Masterlist_${now}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
