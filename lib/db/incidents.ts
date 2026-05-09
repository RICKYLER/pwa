import { db, STORE_NAMES } from './indexeddb';
import type { Incident, IncidentStatus } from './schema';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import { DEFAULT_BARANGAY_CENTER } from '../map-pins';

function generateId(): string {
    return `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Severity sort order — lower number = higher urgency
const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};

const INCIDENT_STATUS_PROGRESS: Record<IncidentStatus, number> = {
    reported: 0,
    verified: 1,
    responding: 2,
    resolved: 3,
};

const DEMO_INCIDENT_COORDINATES: Record<string, { gps_lat: number; gps_lng: number }> = {
    'Purok 3, Sitio Malabog': { gps_lat: DEFAULT_BARANGAY_CENTER.lat - 0.0026, gps_lng: DEFAULT_BARANGAY_CENTER.lng - 0.0018 },
    'Purok 1, Zone A — House #114': { gps_lat: DEFAULT_BARANGAY_CENTER.lat + 0.0017, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0014 },
    'Purok 5, Barangay Hall Area': { gps_lat: DEFAULT_BARANGAY_CENTER.lat + 0.0008, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0036 },
    'Coastal Purok 7': { gps_lat: DEFAULT_BARANGAY_CENTER.lat + 0.0062, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0081 },
    'Purok 2, Central Zone': { gps_lat: DEFAULT_BARANGAY_CENTER.lat - 0.0012, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0006 },
};

type DemoIncidentSeed = {
    id: string;
    type: Incident['type'];
    location: string;
    severity: Incident['severity'];
    status: IncidentStatus;
    minutesAgo: number;
    description: string;
    archived?: boolean;
};

const DEMO_INCIDENT_SEEDS: DemoIncidentSeed[] = [
    {
        id: 'demo_incident_flood_purok_3',
        type: 'flood',
        location: 'Purok 3, Sitio Malabog',
        severity: 'critical',
        status: 'reported',
        minutesAgo: 15,
        description: 'Floodwater rising — 12 families need immediate evacuation. Road impassable.',
    },
    {
        id: 'demo_incident_medical_zone_a',
        type: 'medical',
        location: 'Purok 1, Zone A — House #114',
        severity: 'high',
        status: 'verified',
        minutesAgo: 45,
        description: 'Elderly resident with chest pain. Family requests transport to Mabini Health Infirmary.',
    },
    {
        id: 'demo_incident_fire_barangay_hall',
        type: 'fire',
        location: 'Purok 5, Barangay Hall Area',
        severity: 'high',
        status: 'responding',
        minutesAgo: 90,
        description: 'Cooking fire spread to adjacent structure. BFP en-route. 3 families displaced.',
        archived: true,
    },
    {
        id: 'demo_incident_typhoon_coastal',
        type: 'typhoon',
        location: 'Coastal Purok 7',
        severity: 'medium',
        status: 'verified',
        minutesAgo: 180,
        description: 'Pre-emptive typhoon evacuation advisory for low-lying coastal households in Mabini.',
    },
    {
        id: 'demo_incident_power_outage_central',
        type: 'other',
        location: 'Purok 2, Central Zone',
        severity: 'low',
        status: 'resolved',
        minutesAgo: 300,
        description: 'Power outage affecting 22 households. VECO notified — ETA 2 hours.',
    },
];

const ACTIVE_DEMO_INCIDENT_SEEDS = DEMO_INCIDENT_SEEDS.filter((seed) => !seed.archived);
const DEMO_INCIDENT_SEEDING_ENABLED = false;

const DEMO_INCIDENT_DESCRIPTION_VARIANTS: Record<string, string[]> = {
    demo_incident_flood_purok_3: [
        'Floodwater rising — 12 families need immediate evacuation. Road impassable.',
    ],
    demo_incident_medical_zone_a: [
        'Elderly resident with chest pain. Family unable to transport to hospital.',
        'Elderly resident with chest pain. Family requests transport to Mabini Health Infirmary.',
    ],
    demo_incident_fire_barangay_hall: [
        'Cooking fire spread to adjacent structure. BFP en-route. 3 families displaced.',
    ],
    demo_incident_typhoon_coastal: [
        'Pre-emptive evacuation advisory. 8 families in low-lying areas.',
        'Pre-emptive typhoon evacuation advisory for low-lying coastal households in Mabini.',
    ],
    demo_incident_power_outage_central: [
        'Power outage affecting 22 households. VECO notified — ETA 2 hours.',
    ],
};

function normalizeIncidentText(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveIncidentCoordinates(location: string) {
    return DEMO_INCIDENT_COORDINATES[location] ?? null;
}

type DemoIncidentSeedMatch = Pick<Incident, 'id' | 'type' | 'location' | 'description'>;

function resolveDemoSeed(incident: DemoIncidentSeedMatch) {
    const directSeed = DEMO_INCIDENT_SEEDS.find((seed) => seed.id === incident.id);
    if (directSeed) {
        return directSeed;
    }

    const normalizedLocation = normalizeIncidentText(incident.location);
    const normalizedDescription = normalizeIncidentText(incident.description);

    return DEMO_INCIDENT_SEEDS.find((seed) => (
        seed.type === incident.type
        && normalizeIncidentText(seed.location) === normalizedLocation
        && (DEMO_INCIDENT_DESCRIPTION_VARIANTS[seed.id] ?? [seed.description])
            .map(normalizeIncidentText)
            .includes(normalizedDescription)
    )) ?? null;
}

export function isKnownDemoIncident(incident: DemoIncidentSeedMatch) {
    return Boolean(resolveDemoSeed(incident));
}

function choosePreferredDuplicateIncident(current: Incident, candidate: Incident) {
    const currentProgress = INCIDENT_STATUS_PROGRESS[current.status] ?? -1;
    const candidateProgress = INCIDENT_STATUS_PROGRESS[candidate.status] ?? -1;

    if (candidateProgress !== currentProgress) {
        return candidateProgress > currentProgress ? candidate : current;
    }

    return new Date(candidate.reported_at).getTime() > new Date(current.reported_at).getTime()
        ? candidate
        : current;
}

function collapseDemoIncidents(incidents: Incident[]) {
    const dedupedDemoIncidents = new Map<string, Incident>();
    const liveIncidents: Incident[] = [];

    incidents.forEach((incident) => {
        const demoSeed = resolveDemoSeed(incident);

        if (!demoSeed) {
            liveIncidents.push(incident);
            return;
        }

        if (!DEMO_INCIDENT_SEEDING_ENABLED) {
            return;
        }

        if (demoSeed.archived) {
            return;
        }

        const existing = dedupedDemoIncidents.get(demoSeed.id);
        dedupedDemoIncidents.set(
            demoSeed.id,
            existing ? choosePreferredDuplicateIncident(existing, incident) : incident,
        );
    });

    return [...liveIncidents, ...dedupedDemoIncidents.values()];
}

function hasIncidentCoordinates(incident: Pick<Incident, 'gps_lat' | 'gps_lng'>): incident is Incident & {
    gps_lat: number;
    gps_lng: number;
} {
    return typeof incident.gps_lat === 'number' && typeof incident.gps_lng === 'number';
}

function withResolvedIncidentCoordinates(incident: Incident): Incident {
    if (hasIncidentCoordinates(incident)) {
        return incident;
    }

    const coords = resolveIncidentCoordinates(incident.location);
    if (!coords) {
        return incident;
    }

    return {
        ...incident,
        ...coords,
    };
}

/**
 * Get all incidents, sorted by severity then most-recent first
 */
export async function getIncidents(filters?: {
    status?: IncidentStatus;
}): Promise<Incident[]> {
    try {
        const storedIncidents = await db.getAll<Incident>(STORE_NAMES.incidents);
        const knownDemoIncidentIds = storedIncidents
            .filter((incident) => isKnownDemoIncident(incident))
            .map((incident) => incident.id);

        await Promise.all(
            knownDemoIncidentIds.map((incidentId) => db.deleteSilently(STORE_NAMES.incidents, incidentId)),
        );

        const all = collapseDemoIncidents(
            storedIncidents
                .filter((incident) => !knownDemoIncidentIds.includes(incident.id))
                .map(withResolvedIncidentCoordinates),
        );
        let result = all;
        if (filters?.status) result = result.filter(i => i.status === filters.status);
        return result.sort((a, b) => {
            const severityDiff = (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
            if (severityDiff !== 0) return severityDiff;
            return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
        });
    } catch (error) {
        console.error('Error fetching incidents:', error);
        throw error;
    }
}

/**
 * Get a single incident by ID
 */
export async function getIncident(id: string): Promise<Incident | undefined> {
    try {
        const incident = await db.get<Incident>(STORE_NAMES.incidents, id);
        if (!incident) {
            return undefined;
        }

        if (isKnownDemoIncident(incident)) {
            await db.deleteSilently(STORE_NAMES.incidents, incident.id);
            return undefined;
        }

        return withResolvedIncidentCoordinates(incident);
    } catch (error) {
        console.error('Error fetching incident:', error);
        throw error;
    }
}

/**
 * Create a new incident report
 */
export async function createIncident(
    data: Omit<Incident, 'id' | 'syncStatus'>,
): Promise<Incident> {
    return createIncidentWithId(generateId(), data);
}

async function createIncidentWithId(
    id: string,
    data: Omit<Incident, 'id' | 'syncStatus'>,
): Promise<Incident> {
    try {
        const incident: Incident = {
            ...data,
            source: data.source ?? 'manual',
            id,
            syncStatus: 'synced',
        };
        await runServerMutation({
            action: 'create_incident',
            incident: {
                ...incident,
                location: incident.location.trim(),
                description: incident.description.trim(),
            },
        });
        await bootstrapCurrentPathData(true);
        const createdIncident = await getIncident(incident.id);
        if (!createdIncident) {
            throw new Error('Incident was created in Supabase, but it did not rehydrate locally.');
        }
        console.log('Incident created:', incident.id);
        return createdIncident;
    } catch (error) {
        console.error('Error creating incident:', error);
        throw error;
    }
}

/**
 * Update incident status (field responder action)
 */
export async function updateIncidentStatus(
    id: string,
    status: IncidentStatus,
): Promise<Incident> {
    try {
        await runServerMutation({
            action: 'update_incident_status',
            incidentId: id,
            status,
        });
        await bootstrapCurrentPathData(true);
        const updatedIncident = await getIncident(id);
        if (!updatedIncident) {
            throw new Error('Incident was updated in Supabase, but it did not rehydrate locally.');
        }
        console.log('Incident status updated:', id, '->', status);
        return updatedIncident;
    } catch (error) {
        console.error('Error updating incident status:', error);
        throw error;
    }
}

/**
 * Demo incident seeding is retired for this real-time deployment.
 */
export async function seedDemoIncidents(reporterId: string): Promise<void> {
    void reporterId;
    if (!DEMO_INCIDENT_SEEDING_ENABLED) {
        return;
    }

    try {
        await bootstrapCurrentPathData();

        const existing = await db.getAll<Incident>(STORE_NAMES.incidents);
        const existingDemoIds = new Set(
            existing
                .map((incident) => resolveDemoSeed(incident))
                .filter((seed): seed is DemoIncidentSeed => Boolean(seed && !seed.archived))
                .map((seed) => seed.id),
        );
        const missingSeeds = ACTIVE_DEMO_INCIDENT_SEEDS.filter((seed) => !existingDemoIds.has(seed.id));

        if (missingSeeds.length === 0) {
            return;
        }

        for (const seed of missingSeeds) {
            try {
                await runServerMutation({
                    action: 'create_incident',
                    incident: {
                        id: seed.id,
                        type: seed.type,
                        location: seed.location,
                        gps_lat: DEMO_INCIDENT_COORDINATES[seed.location]!.gps_lat,
                        gps_lng: DEMO_INCIDENT_COORDINATES[seed.location]!.gps_lng,
                        severity: seed.severity,
                        status: seed.status,
                        reported_by: reporterId,
                        reported_at: new Date(Date.now() - (1000 * 60 * seed.minutesAgo)),
                        description: seed.description,
                    },
                });
            } catch (error) {
                const message = error instanceof Error ? error.message.toLowerCase() : '';
                if (!message.includes('duplicate') && !message.includes('already exists')) {
                    throw error;
                }
            }
        }

        await bootstrapCurrentPathData(true);
        console.log('Demo incidents ensured:', missingSeeds.length);
    } catch (error) {
        console.error('Error seeding demo incidents:', error);
    }
}
