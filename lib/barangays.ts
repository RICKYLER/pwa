export const BARANGAY_IDS = [
  'anitapan',
  'cabuyuan',
  'cadunan',
  'cuambog',
  'del-pilar',
  'golden-valley',
  'libodon',
  'pangibiran',
  'pindasan',
  'san-antonio',
  'tagnan',
] as const;

export type BarangayId = (typeof BARANGAY_IDS)[number];

export const BARANGAY_OPTIONS: ReadonlyArray<{ id: BarangayId; label: string }> = [
  { id: 'anitapan', label: 'Anitapan' },
  { id: 'cabuyuan', label: 'Cabuyuan' },
  { id: 'cadunan', label: 'Cadunan' },
  { id: 'cuambog', label: 'Cuambog' },
  { id: 'del-pilar', label: 'Del Pilar' },
  { id: 'golden-valley', label: 'Golden Valley' },
  { id: 'libodon', label: 'Libodon' },
  { id: 'pangibiran', label: 'Pangibiran' },
  { id: 'pindasan', label: 'Pindasan' },
  { id: 'san-antonio', label: 'San Antonio' },
  { id: 'tagnan', label: 'Tagnan' },
];

const BARANGAY_LABELS: Record<BarangayId, string> = {
  anitapan: 'Anitapan',
  cabuyuan: 'Cabuyuan',
  cadunan: 'Cadunan',
  cuambog: 'Cuambog',
  'del-pilar': 'Del Pilar',
  'golden-valley': 'Golden Valley',
  libodon: 'Libodon',
  pangibiran: 'Pangibiran',
  pindasan: 'Pindasan',
  'san-antonio': 'San Antonio',
  tagnan: 'Tagnan',
};

export function isBarangayId(value: string): value is BarangayId {
  return BARANGAY_IDS.includes(value as BarangayId);
}

export function getBarangayLabel(value?: string | null): string | null {
  if (!value || !isBarangayId(value)) {
    return null;
  }

  return BARANGAY_LABELS[value];
}

export function normalizeBarangaySelection(value?: string | null): BarangayId | '' {
  if (!value || !isBarangayId(value)) {
    return '';
  }

  return value;
}
