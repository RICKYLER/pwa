/**
 * seed-cuambog-puroks.mjs
 * Seeds the official location master list (10 puroks) for Barangay Cuambog,
 * Mabini, Davao de Oro, plus default purok flood-risk profiles — mirroring
 * what saveLocationMasterListOnServer does when an admin saves the list via
 * the Location Review page.
 * Run: node scripts/seed-cuambog-puroks.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BARANGAY_ID = 'cuambog';
const BARANGAY_NAME = 'Cuambog';
const MUNICIPALITY = 'Mabini';

// Official puroks of Barangay Cuambog (canonical, normalizePurokSitio form).
const CUAMBOG_PUROKS = [
  'Purok Malipayon',
  'Purok Makugihon',
  'Purok Mura-Murahan',
  'Purok Matinabangon',
  'Purok Magtalisay',
  'Purok Madasigon',
  'Purok Pagkakaisa',
  'Purok Mauswagon',
  'Purok Luyaw',
  'Purok Makiangayon',
];

// Load env from .env.local
function loadEnv() {
  const envPath = resolve(__dirname, '../.env.local');
  const content = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

function buildProfileId(barangayId, purokSitio) {
  return `${barangayId.trim()}::${purokSitio}`;
}

async function resolveAdminActorId(supabase) {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .limit(1);

  if (error || !data || data.length === 0) {
    console.warn('⚠️  No admin user found in the users table — seeding with updated_by = null.');
    return null;
  }

  return data[0].id;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const actorId = await resolveAdminActorId(supabase);
  const now = new Date().toISOString();

  // 1. Upsert the official location master list for Cuambog
  const masterListPayload = {
    id: BARANGAY_ID,
    barangay_id: BARANGAY_ID,
    municipality: MUNICIPALITY,
    barangay_name: BARANGAY_NAME,
    puroks: CUAMBOG_PUROKS,
    updated_at: now,
    updated_by: actorId,
  };

  const { error: masterListError } = await supabase
    .from('location_master_lists')
    .upsert(masterListPayload, { onConflict: 'id' });

  if (masterListError) {
    console.error('❌ Failed to upsert location master list:', masterListError.message);
    process.exit(1);
  }

  console.log(`✅ Seeded the official master list for ${BARANGAY_NAME} (${CUAMBOG_PUROKS.length} puroks):`);
  for (const purok of CUAMBOG_PUROKS) {
    console.log(`   ${purok}`);
  }

  // 2. Upsert default purok flood-risk profiles (same as the admin UI save flow)
  const profiles = CUAMBOG_PUROKS.map((purok) => ({
    id: buildProfileId(BARANGAY_ID, purok),
    barangay_id: BARANGAY_ID,
    purok_sitio: purok,
    flood_prone: false,
    flood_control_status: 'unknown',
    flood_control_notes: null,
    default_evacuation_site: null,
    warning_notes: null,
    updated_at: now,
    updated_by: actorId,
    sync_status: 'synced',
  }));

  const { error: profilesError } = await supabase
    .from('purok_risk_profiles')
    .upsert(profiles, { onConflict: 'id', ignoreDuplicates: true });

  if (profilesError) {
    console.error('❌ Failed to upsert purok risk profiles:', profilesError.message);
    process.exit(1);
  }

  console.log(`\n✅ Seeded ${profiles.length} default purok flood-risk profile(s).`);
  console.log('\nResidents registering under Cuambog will now pick their purok from a dropdown.');
  console.log('Set flood-prone flags later via the Alerts page if needed.\n');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
