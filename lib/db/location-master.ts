import { db, STORE_NAMES } from './indexeddb';
import type { LocationMasterList } from './schema';
import { createAuditLog, getCurrentUser } from '../auth';
import {
  normalizeBarangayName,
  normalizeMunicipalityName,
  normalizePurokSitio,
} from '../geocoding';

function normalizePurokList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizePurokSitio(value))
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function normalizeMasterList(masterList: LocationMasterList): LocationMasterList {
  return {
    ...masterList,
    municipality: normalizeMunicipalityName(masterList.municipality),
    barangay_name: normalizeBarangayName(masterList.barangay_name),
    puroks: normalizePurokList(masterList.puroks),
    updatedAt: masterList.updatedAt instanceof Date ? masterList.updatedAt : new Date(masterList.updatedAt),
  };
}

export async function getLocationMasterList(
  barangay_id: string,
): Promise<LocationMasterList | undefined> {
  if (!barangay_id) return undefined;

  const record = await db.get<LocationMasterList>(STORE_NAMES.location_master_lists, barangay_id);
  return record ? normalizeMasterList(record) : undefined;
}

export async function saveLocationMasterList(input: {
  barangay_id: string;
  municipality: string;
  barangay_name: string;
  puroks: string[];
}): Promise<LocationMasterList> {
  const currentUser = getCurrentUser();
  const masterList = normalizeMasterList({
    id: input.barangay_id,
    barangay_id: input.barangay_id,
    municipality: input.municipality,
    barangay_name: input.barangay_name,
    puroks: input.puroks,
    updatedAt: new Date(),
    updatedBy: currentUser?.name || currentUser?.id,
  });

  await db.put(STORE_NAMES.location_master_lists, masterList);
  await createAuditLog('UPSERT', 'location_master', masterList.id, {
    municipality: masterList.municipality,
    barangay_name: masterList.barangay_name,
    puroks: masterList.puroks,
  });

  return masterList;
}
