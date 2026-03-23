import { db, STORE_NAMES } from './indexeddb';
import type { LocationMasterList } from './schema';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapAllDataFromSupabase } from '@/lib/supabase/bootstrap';
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
  const masterList = normalizeMasterList({
    id: input.barangay_id,
    barangay_id: input.barangay_id,
    municipality: input.municipality,
    barangay_name: input.barangay_name,
    puroks: input.puroks,
    updatedAt: new Date(),
  });

  await runServerMutation({
    action: 'save_location_master_list',
    input: {
      barangay_id: masterList.barangay_id,
      municipality: masterList.municipality,
      barangay_name: masterList.barangay_name,
      puroks: masterList.puroks,
    },
  });

  await bootstrapAllDataFromSupabase(true);

  const updatedMasterList = await getLocationMasterList(input.barangay_id);
  if (!updatedMasterList) {
    throw new Error('Master list was saved in Supabase, but it did not rehydrate locally.');
  }

  return updatedMasterList;
}
