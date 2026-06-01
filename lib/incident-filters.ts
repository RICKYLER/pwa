import type { Incident } from '@/lib/db/schema';

type IncidentFingerprint = Pick<Incident, 'type' | 'location' | 'description'>;

const LEGACY_SAMPLE_INCIDENTS: IncidentFingerprint[] = [
  {
    type: 'flood',
    location: 'Purok 3, Sitio Malabog',
    description: 'Floodwater rising - 12 families need immediate evacuation. Road impassable.',
  },
  {
    type: 'medical',
    location: 'Purok 1, Zone A - House #114',
    description: 'Elderly resident with chest pain. Family unable to transport to hospital.',
  },
  {
    type: 'medical',
    location: 'Purok 1, Zone A - House #114',
    description: 'Elderly resident with chest pain. Family requests transport to Mabini Health Infirmary.',
  },
  {
    type: 'fire',
    location: 'Purok 5, Barangay Hall Area',
    description: 'Cooking fire spread to adjacent structure. BFP en-route. 3 families displaced.',
  },
  {
    type: 'typhoon',
    location: 'Coastal Purok 7',
    description: 'Pre-emptive evacuation advisory. 8 families in low-lying areas.',
  },
  {
    type: 'typhoon',
    location: 'Coastal Purok 7',
    description: 'Pre-emptive typhoon evacuation advisory for low-lying coastal households in Mabini.',
  },
  {
    type: 'other',
    location: 'Purok 2, Central Zone',
    description: 'Power outage affecting 22 households. VECO notified - ETA 2 hours.',
  },
];

function normalizeFingerprintText(value?: string | null) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/\s+/g, ' ');
}

export function isLegacySampleIncident(
  incident: Pick<Incident, 'id' | 'type' | 'location' | 'description'>,
) {
  if (incident.id.startsWith('demo_incident_')) {
    return true;
  }

  const location = normalizeFingerprintText(incident.location);
  const description = normalizeFingerprintText(incident.description);

  return LEGACY_SAMPLE_INCIDENTS.some((sample) => (
    sample.type === incident.type
    && normalizeFingerprintText(sample.location) === location
    && normalizeFingerprintText(sample.description) === description
  ));
}
