/**
 * seed-purok-profiles.mjs
 * Seeds purok_risk_profiles into Supabase from existing household barangay+purok_sitio combos.
 * Run: node scripts/seed-purok-profiles.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function normalizePurok(value) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const purokMatch = cleaned.match(/^(?:purok|prk|pk)\s*([a-z0-9-]+)$/i);
  if (purokMatch?.[1]) return `Purok ${purokMatch[1].toUpperCase()}`;
  const sitioMatch = cleaned.match(/^(?:sitio|stio)\s+(.+)$/i);
  if (sitioMatch?.[1]) return `Sitio ${sitioMatch[1].replace(/\b\w/g, c => c.toUpperCase())}`;
  const onlyNum = cleaned.match(/^([0-9]+[a-z]?)$/i);
  if (onlyNum?.[1]) return `Purok ${onlyNum[1].toUpperCase()}`;
  return cleaned.replace(/\b\w/g, c => c.toUpperCase());
}

function buildProfileId(barangayId, purokSitio) {
  return `${barangayId.trim()}::${normalizePurok(purokSitio)}`;
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

  // 1. Fetch all households
  const { data: households, error: hhErr } = await supabase
    .from('households')
    .select('barangay_id, purok_sitio')
    .eq('status', 'active');

  if (hhErr) {
    console.error('❌ Failed to fetch households:', hhErr.message);
    process.exit(1);
  }

  // 2. Deduplicate barangay + purok combos
  const seen = new Set();
  const profiles = [];

  for (const hh of households ?? []) {
    const normalizedPurok = normalizePurok(hh.purok_sitio);
    if (!normalizedPurok) continue;
    const id = buildProfileId(hh.barangay_id, normalizedPurok);
    if (seen.has(id)) continue;
    seen.add(id);
    profiles.push({
      id,
      barangay_id: hh.barangay_id.trim(),
      purok_sitio: normalizedPurok,
      flood_prone: false,
      flood_control_status: 'unknown',
      sync_status: 'synced',
    });
  }

  if (profiles.length === 0) {
    console.log('⚠️  No households found in Supabase to seed puroks from.');
    process.exit(0);
  }

  console.log(`📋 Found ${profiles.length} unique purok(s) across barangays:`);
  for (const p of profiles) {
    console.log(`   ${p.barangay_id} → ${p.purok_sitio}`);
  }

  // 3. Upsert into purok_risk_profiles (skip duplicates by id)
  const { data: upserted, error: upsertErr } = await supabase
    .from('purok_risk_profiles')
    .upsert(profiles, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');

  if (upsertErr) {
    console.error('❌ Failed to upsert purok profiles:', upsertErr.message);
    process.exit(1);
  }

  console.log(`\n✅ Successfully seeded ${upserted?.length ?? profiles.length} purok risk profile(s) into Supabase!`);
  console.log('\nYou can now:');
  console.log('  1. Go to the Alerts page → set "Flood-prone" and flood control status');
  console.log('  2. Open Field Response → Flood Zones tab will show them in real-time\n');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
