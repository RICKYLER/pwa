import { db, STORE_NAMES } from '@/lib/db/indexeddb';
import type { PurokRiskProfile } from '@/lib/db/schema';
import { runServerMutation } from '@/lib/mutations';
import { bootstrapCurrentPathData } from '@/lib/supabase/route-bootstrap';
import {
  buildPurokRiskProfileId,
  createDefaultPurokRiskProfile,
  normalizePurokRiskProfile,
} from '@/lib/purok-risk-profiles';

export async function getPurokRiskProfiles(barangayId?: string): Promise<PurokRiskProfile[]> {
  const profiles = await db.getAll<PurokRiskProfile>(STORE_NAMES.purok_risk_profiles);
  return profiles
    .map(normalizePurokRiskProfile)
    .filter((profile) => !barangayId || profile.barangay_id === barangayId)
    .sort((left, right) => left.purok_sitio.localeCompare(right.purok_sitio, undefined, { numeric: true }));
}

export async function getPurokRiskProfile(
  barangayId: string,
  purokSitio: string,
): Promise<PurokRiskProfile | undefined> {
  const id = buildPurokRiskProfileId(barangayId, purokSitio);
  const profile = await db.get<PurokRiskProfile>(STORE_NAMES.purok_risk_profiles, id);
  return profile ? normalizePurokRiskProfile(profile) : undefined;
}

export async function ensurePurokRiskProfilesForPuroks(input: {
  barangay_id: string;
  puroks: string[];
  updatedBy?: string;
}) {
  const existingProfiles = await getPurokRiskProfiles(input.barangay_id);
  const existingById = new Map(existingProfiles.map((profile) => [profile.id, profile]));

  return input.puroks.map((purok) => {
    const profileId = buildPurokRiskProfileId(input.barangay_id, purok);
    return existingById.get(profileId) ?? createDefaultPurokRiskProfile({
      barangay_id: input.barangay_id,
      purok_sitio: purok,
      updatedBy: input.updatedBy,
    });
  });
}

export async function savePurokRiskProfiles(input: {
  barangay_id: string;
  profiles: Array<Pick<
    PurokRiskProfile,
    | 'purok_sitio'
    | 'flood_prone'
    | 'flood_control_status'
    | 'flood_control_notes'
    | 'default_evacuation_site'
    | 'warning_notes'
  >>;
}) {
  const payload = await runServerMutation<{ profiles: Record<string, unknown>[] }>({
    action: 'save_purok_risk_profiles',
    input,
  });

  await bootstrapCurrentPathData(true);
  return Array.isArray(payload.profiles)
    ? payload.profiles.map((profile) => normalizePurokRiskProfile(profile as unknown as PurokRiskProfile))
    : [];
}
