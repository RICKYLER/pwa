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

const DEMO_INCIDENT_COORDINATES: Record<string, { gps_lat: number; gps_lng: number }> = {
    'Purok 3, Sitio Malabog': { gps_lat: DEFAULT_BARANGAY_CENTER.lat - 0.0026, gps_lng: DEFAULT_BARANGAY_CENTER.lng - 0.0018 },
    'Purok 1, Zone A — House #114': { gps_lat: DEFAULT_BARANGAY_CENTER.lat + 0.0017, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0014 },
    'Purok 5, Barangay Hall Area': { gps_lat: DEFAULT_BARANGAY_CENTER.lat + 0.0008, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0036 },
    'Coastal Purok 7': { gps_lat: DEFAULT_BARANGAY_CENTER.lat + 0.0062, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0081 },
    'Purok 2, Central Zone': { gps_lat: DEFAULT_BARANGAY_CENTER.lat - 0.0012, gps_lng: DEFAULT_BARANGAY_CENTER.lng + 0.0006 },
};

function resolveIncidentCoordinates(location: string) {
    return DEMO_INCIDENT_COORDINATES[location] ?? null;
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
        const all = (await db.getAll<Incident>(STORE_NAMES.incidents)).map(withResolvedIncidentCoordinates);
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
        return incident ? withResolvedIncidentCoordinates(incident) : undefined;
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
    try {
        const incident: Incident = {
            ...data,
            id: generateId(),
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
 * Seed a few demo incidents so the Responder view always has data to show
 */
export async function seedDemoIncidents(reporterId: string): Promise<void> {
    try {
        const existing = await db.getAll<Incident>(STORE_NAMES.incidents);
        if (existing.length > 0) {
            return; // already seeded
        }

        const demos: Omit<Incident, 'id' | 'syncStatus'>[] = [
            {
                type: 'flood',
                location: 'Purok 3, Sitio Malabog',
                gps_lat: DEMO_INCIDENT_COORDINATES['Purok 3, Sitio Malabog']!.gps_lat,
                gps_lng: DEMO_INCIDENT_COORDINATES['Purok 3, Sitio Malabog']!.gps_lng,
                severity: 'critical',
                status: 'reported',
                reported_by: reporterId,
                reported_at: new Date(Date.now() - 1000 * 60 * 15),
                description: 'Floodwater rising — 12 families need immediate evacuation. Road impassable.',
            },
            {
                type: 'medical',
                location: 'Purok 1, Zone A — House #114',
                gps_lat: DEMO_INCIDENT_COORDINATES['Purok 1, Zone A — House #114']!.gps_lat,
                gps_lng: DEMO_INCIDENT_COORDINATES['Purok 1, Zone A — House #114']!.gps_lng,
                severity: 'high',
                status: 'verified',
                reported_by: reporterId,
                reported_at: new Date(Date.now() - 1000 * 60 * 45),
                description: 'Elderly resident with chest pain. Family unable to transport to hospital.',
            },
            {
                type: 'fire',
                location: 'Purok 5, Barangay Hall Area',
                gps_lat: DEMO_INCIDENT_COORDINATES['Purok 5, Barangay Hall Area']!.gps_lat,
                gps_lng: DEMO_INCIDENT_COORDINATES['Purok 5, Barangay Hall Area']!.gps_lng,
                severity: 'high',
                status: 'responding',
                reported_by: reporterId,
                reported_at: new Date(Date.now() - 1000 * 60 * 90),
                description: 'Cooking fire spread to adjacent structure. BFP en-route. 3 families displaced.',
            },
            {
                type: 'typhoon',
                location: 'Coastal Purok 7',
                gps_lat: DEMO_INCIDENT_COORDINATES['Coastal Purok 7']!.gps_lat,
                gps_lng: DEMO_INCIDENT_COORDINATES['Coastal Purok 7']!.gps_lng,
                severity: 'medium',
                status: 'verified',
                reported_by: reporterId,
                reported_at: new Date(Date.now() - 1000 * 60 * 180),
                description: 'Pre-emptive evacuation advisory. 8 families in low-lying areas.',
            },
            {
                type: 'other',
                location: 'Purok 2, Central Zone',
                gps_lat: DEMO_INCIDENT_COORDINATES['Purok 2, Central Zone']!.gps_lat,
                gps_lng: DEMO_INCIDENT_COORDINATES['Purok 2, Central Zone']!.gps_lng,
                severity: 'low',
                status: 'resolved',
                reported_by: reporterId,
                reported_at: new Date(Date.now() - 1000 * 60 * 300),
                description: 'Power outage affecting 22 households. VECO notified — ETA 2 hours.',
            },
        ];

        await Promise.all(demos.map(d => createIncident(d)));
        console.log('Demo incidents seeded:', demos.length);
    } catch (error) {
        console.error('Error seeding demo incidents:', error);
    }
}
