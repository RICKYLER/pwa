import { BARANGAY_IDS, type BarangayId } from '@/lib/barangays';

export const MABINI_MUNICIPAL_PSGC = '1108203000' as const;

export interface MabiniBarangayRegistryEntry {
  id: BarangayId;
  label: string;
  psgc: string;
  /** Verified land area in km² from the official barangay boundary dataset. */
  areaKm2: number;
}

// Official PSGC codes and verified areas for the 11 barangays of Mabini,
// Davao de Oro (municipality PSGC 1108203000).
export const BARANGAY_REGISTRY: ReadonlyArray<MabiniBarangayRegistryEntry> = [
  { id: 'cadunan', label: 'Cadunan', psgc: '1108203002', areaKm2: 18.43425703 },
  { id: 'pindasan', label: 'Pindasan', psgc: '1108203006', areaKm2: 6.47417964 },
  { id: 'cuambog', label: 'Cuambog', psgc: '1108203007', areaKm2: 2.41070776 },
  { id: 'tagnanan', label: 'Tagnanan', psgc: '1108203011', areaKm2: 16.07704139 },
  { id: 'anitapan', label: 'Anitapan', psgc: '1108203012', areaKm2: 20.29265403 },
  { id: 'cabuyuan', label: 'Cabuyuan', psgc: '1108203013', areaKm2: 16.27668413 },
  { id: 'del-pilar', label: 'Del Pilar', psgc: '1108203014', areaKm2: 13.87286252 },
  { id: 'libodon', label: 'Libodon', psgc: '1108203015', areaKm2: 14.90344152 },
  { id: 'golden-valley', label: 'Golden Valley', psgc: '1108203016', areaKm2: 88.24734446 },
  { id: 'pangibiran', label: 'Pangibiran', psgc: '1108203017', areaKm2: 14.93844857 },
  { id: 'san-antonio', label: 'San Antonio', psgc: '1108203018', areaKm2: 2.65369552 },
];

export interface BarangayBoundaryColorSet {
  /** Subtle polygon fill. */
  fill: string;
  /** Thin polygon boundary stroke (darker variant of the fill). */
  stroke: string;
}

// One distinct color per barangay so responders can tell the response zones
// apart at a glance. Professional LGU palette anchored on teal/green accents.
export const BARANGAY_BOUNDARY_COLORS: Record<BarangayId, BarangayBoundaryColorSet> = {
  cadunan: { fill: '#0d9488', stroke: '#115e59' },
  pindasan: { fill: '#0891b2', stroke: '#155e75' },
  cuambog: { fill: '#65a30d', stroke: '#3f6212' },
  tagnanan: { fill: '#ca8a04', stroke: '#854d0e' },
  anitapan: { fill: '#ea580c', stroke: '#9a3412' },
  cabuyuan: { fill: '#dc2626', stroke: '#991b1b' },
  'del-pilar': { fill: '#db2777', stroke: '#9d174d' },
  libodon: { fill: '#9333ea', stroke: '#6b21a8' },
  'golden-valley': { fill: '#4f46e5', stroke: '#3730a3' },
  pangibiran: { fill: '#0284c7', stroke: '#075985' },
  'san-antonio': { fill: '#16a34a', stroke: '#166534' },
};

const REGISTRY_BY_ID = new Map<BarangayId, MabiniBarangayRegistryEntry>(
  BARANGAY_REGISTRY.map((entry) => [entry.id, entry]),
);

const REGISTRY_BY_PSGC = new Map<string, MabiniBarangayRegistryEntry>(
  BARANGAY_REGISTRY.map((entry) => [entry.psgc, entry]),
);

export function getBarangayRegistryEntry(id: string): MabiniBarangayRegistryEntry | null {
  return REGISTRY_BY_ID.get(id as BarangayId) ?? null;
}

export function getBarangayByPsgc(psgc: string): MabiniBarangayRegistryEntry | null {
  return REGISTRY_BY_PSGC.get(psgc) ?? null;
}

export function getBarangayPsgc(id: string): string | null {
  return REGISTRY_BY_ID.get(id as BarangayId)?.psgc ?? null;
}

export function getBarangayBoundaryColors(id: string): BarangayBoundaryColorSet {
  return (
    BARANGAY_BOUNDARY_COLORS[id as BarangayId]
    ?? { fill: '#0f766e', stroke: '#134e4a' }
  );
}

export function formatBarangayArea(areaKm2: number): string {
  return `${areaKm2.toFixed(2)} km²`;
}

export function getBarangayPsgcFilterList(): string[] {
  return BARANGAY_REGISTRY.map((entry) => entry.psgc);
}

// Legacy names still used by the GeoRisk/PSA source layer. Matched after
// normalization (lowercase, parenthetical stripped) in barangay-geometry.
export const LEGACY_SOURCE_NAME_ALIASES: Record<string, BarangayId> = {
  'cuambog (pob.)': 'cuambog',
  'tagnanan (mampising)': 'tagnanan',
  'golden valley (maraut)': 'golden-valley',
};

export function isMabiniBarangayId(value: string): value is BarangayId {
  return BARANGAY_IDS.includes(value as BarangayId);
}
