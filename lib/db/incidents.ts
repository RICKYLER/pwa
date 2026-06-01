import { db, STORE_NAMES } from './indexeddb';
import type { Incident, IncidentStatus } from './schema';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import { isLegacySampleIncident } from '@/lib/incident-filters';

function generateId(): string {
    return `inc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Severity sort order: lower number = higher urgency
const SEVERITY_ORDER: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};

/**
 * Get all incidents, sorted by severity then most-recent first.
 *
 * Incidents are production records only. Exact legacy sample fingerprints are
 * cleaned up so old seeded rows do not flood the field response queue.
 */
export async function getIncidents(filters?: {
    status?: IncidentStatus;
}): Promise<Incident[]> {
    try {
        const storedIncidents = await db.getAll<Incident>(STORE_NAMES.incidents);
        const legacySampleIncidentIds = storedIncidents
            .filter((incident) => isLegacySampleIncident(incident))
            .map((incident) => incident.id);

        await Promise.all(
            legacySampleIncidentIds.map((incidentId) => db.deleteSilently(STORE_NAMES.incidents, incidentId)),
        );

        let result = storedIncidents.filter((incident) => !legacySampleIncidentIds.includes(incident.id));
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

        if (isLegacySampleIncident(incident)) {
            await db.deleteSilently(STORE_NAMES.incidents, incident.id);
            return undefined;
        }

        return incident;
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
