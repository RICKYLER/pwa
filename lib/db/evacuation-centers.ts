import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import type { EvacuationCenter, EvacuationCenterStatus } from '@/lib/db/schema';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import { normalizeEvacuationCenter } from '@/lib/evacuation-centers';

export async function getEvacuationCenters(barangayId?: string): Promise<EvacuationCenter[]> {
  const centers = await db.getAll<EvacuationCenter>(STORE_NAMES.evacuation_centers);
  return centers
    .map(normalizeEvacuationCenter)
    .filter((center) => !barangayId || center.barangay_id === barangayId)
    .sort((left, right) => (
      left.barangay_id.localeCompare(right.barangay_id)
      || left.name.localeCompare(right.name)
    ));
}

export async function saveEvacuationCenters(input: {
  centers: Array<Pick<
    EvacuationCenter,
    | 'barangay_id'
    | 'name'
    | 'gps_lat'
    | 'gps_lng'
    | 'capacity'
    | 'notes'
  >>;
}) {
  const payload = await runServerMutation<{ centers: Record<string, unknown>[] }>({
    action: 'save_evacuation_centers',
    input,
  });

  await bootstrapCurrentPathData(true);
  return Array.isArray(payload.centers)
    ? payload.centers.map((center) => normalizeEvacuationCenter(center as unknown as EvacuationCenter))
    : [];
}

export async function setEvacuationCenterStatus(input: {
  center_id: string;
  status: EvacuationCenterStatus;
}) {
  const payload = await runServerMutation<{ center: Record<string, unknown> }>({
    action: 'set_evacuation_center_status',
    input,
  });

  await bootstrapCurrentPathData(true);
  return payload.center
    ? normalizeEvacuationCenter(payload.center as unknown as EvacuationCenter)
    : undefined;
}

export async function deleteEvacuationCenter(input: { center_id: string }) {
  await runServerMutation({
    action: 'delete_evacuation_center',
    input,
  });

  await bootstrapCurrentPathData(true);
}
