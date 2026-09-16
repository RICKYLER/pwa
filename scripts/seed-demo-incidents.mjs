/**
 * seed-demo-incidents.mjs
 * Seeds demo flood incidents into Supabase, positioned next to the households
 * already seeded in each purok — so the field-response trigger analysis
 * ("kinsay una tabangan") has real scoped puroks/households to rank.
 *
 * Each incident:
 *   - is type 'flood' + hazard_context 'flood' and unresolved, so it counts as
 *     a trigger (isTriggerAnalyzableIncident)
 *   - has location/description text containing the purok + barangay names, so
 *     incidentMatchesPurok scopes the right priority groups
 *   - has gps coordinates at the centroid of that purok's household pins
 *     (slightly offset so the incident pin does not sit on top of a household)
 *
 * Idempotent: previously seeded rows (id prefix inc_seed_) are removed first.
 * Run: node scripts/seed-demo-incidents.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_ID_PREFIX = 'inc_seed_';

// Mirrors lib/barangays.ts BARANGAY_LABELS.
const BARANGAY_LABELS = {
  anitapan: 'Anitapan',
  cabuyuan: 'Cabuyuan',
  cadunan: 'Cadunan',
  cuambog: 'Cuambog',
  'del-pilar': 'Del Pilar',
  'golden-valley': 'Golden Valley',
  libodon: 'Libodon',
  pangibiran: 'Pangibiran',
  pindasan: 'Pindasan',
  'san-antonio': 'San Antonio',
  tagnanan: 'Tagnanan',
};

// Mirrors normalizePurokSitio in lib/geocoding.ts — the priority engine groups
// households (and matches incidents) using this normalization.
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

async function main() {
  const env = loadEnv();
  const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 0. Clear previous seed runs so re-running is idempotent.
  const { error: deleteError } = await supabase
    .from('incidents')
    .delete()
    .like('id', `${SEED_ID_PREFIX}%`);
  if (deleteError) {
    console.error('❌ Failed to clear previous seed incidents:', deleteError.message);
    process.exit(1);
  }

  // 1. Reporter: any active admin/responder account (incidents.reported_by is
  //    a not-null FK to public.users).
  const { data: reporters, error: reporterError } = await supabase
    .from('users')
    .select('id, email, name, role')
    .in('role', ['admin', 'responder'])
    .eq('status', 'active')
    .limit(1);

  if (reporterError) {
    console.error('❌ Failed to fetch a reporter account:', reporterError.message);
    process.exit(1);
  }
  const reporter = reporters?.[0];
  if (!reporter) {
    console.error('❌ No active admin/responder user found in public.users — incidents need one as reported_by.');
    process.exit(1);
  }

  // 2. Households with GPS — the pins the incidents must sit next to.
  const { data: households, error: hhError } = await supabase
    .from('households')
    .select('id, head_name, barangay_id, barangay_name, purok_sitio, street_address, gps_lat, gps_long')
    .eq('status', 'active')
    .not('gps_lat', 'is', null)
    .not('gps_long', 'is', null);

  if (hhError) {
    console.error('❌ Failed to fetch households:', hhError.message);
    process.exit(1);
  }

  if (!households || households.length === 0) {
    console.log('⚠️  No active households with GPS coordinates found — nothing to place incidents next to.');
    process.exit(0);
  }

  // 3. Group by barangay + purok and compute each group's GPS centroid.
  const groups = new Map();
  for (const hh of households) {
    const purok = normalizePurok(hh.purok_sitio ?? '');
    if (!purok) continue;
    const barangayId = (hh.barangay_id ?? '').trim();
    const key = `${barangayId}::${purok}`;
    const existing = groups.get(key) ?? {
      barangayId,
      barangayLabel: BARANGAY_LABELS[barangayId] ?? hh.barangay_name ?? barangayId,
      purok,
      households: 0,
      latSum: 0,
      lngSum: 0,
    };
    existing.households += 1;
    existing.latSum += hh.gps_lat;
    existing.lngSum += hh.gps_long;
    groups.set(key, existing);
  }

  if (groups.size === 0) {
    console.log('⚠️  No households with a usable purok_sitio found.');
    process.exit(0);
  }

  const entries = Array.from(groups.values());
  const now = new Date().toISOString();
  const stamp = Date.now();

  // 4. One flood incident per purok, at the household centroid (offset a few
  //    hundred meters north-west so the pin is visibly next to the households).
  const incidents = entries.map((group, index) => {
    const lat = group.latSum / group.households + 0.0012;
    const lng = group.lngSum / group.households - 0.0012;
    const location = `${group.purok}, Barangay ${group.barangayLabel}`;
    // Location AND description both carry the purok + barangay names — the
    // engine's incidentMatchesPurok text-matches on this haystack.
    const description = `Monsoon runoff flooding access roads in ${group.purok}, Barangay ${group.barangayLabel}, Mabini, Davao de Oro. ${group.households} registered household${group.households === 1 ? '' : 's'} in the area; water is ankle- to knee-deep and rising. Requesting field verification and assist-first queue for vulnerable residents.`;

    return {
      id: `${SEED_ID_PREFIX}${stamp}_${index}`,
      type: 'flood',
      location,
      gps_lat: lat,
      gps_lng: lng,
      severity: group.households >= 2 ? 'critical' : 'high',
      status: 'reported',
      reported_by: reporter.id,
      reported_at: now,
      photo_url: null,
      description,
      source: 'manual',
      source_alert_id: null,
      source_rule_id: null,
      hazard_context: 'flood',
      context_snapshot: null,
      sync_status: 'synced',
    };
  });

  console.log(`📋 Placing ${incidents.length} flood incident(s) next to seeded households:`);
  for (const incident of incidents) {
    const group = entries.find((g) => `${g.purok}, Barangay ${g.barangayLabel}` === incident.location);
    console.log(`   ${incident.location} — near ${group?.households ?? '?'} household pin(s), ${incident.gps_lat.toFixed(5)}, ${incident.gps_lng.toFixed(5)} [${incident.severity}]`);
  }

  const { data: inserted, error: insertError } = await supabase
    .from('incidents')
    .insert(incidents)
    .select('id, location, severity');

  if (insertError) {
    console.error('❌ Failed to insert seed incidents:', insertError.message);
    process.exit(1);
  }

  console.log(`\n✅ Seeded ${inserted?.length ?? incidents.length} flood incident(s) into Supabase (reported by ${reporter.email}).`);
  console.log('\nNext steps:');
  console.log('  1. Reload the Field Response page (it bootstraps incidents from Supabase)');
  console.log('  2. Click a flood incident pin (or an alert "!" zone) — the trigger dialog');
  console.log('     opens with the assist-first queue for the households in scope.\n');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
