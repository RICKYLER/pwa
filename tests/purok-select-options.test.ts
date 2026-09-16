import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPurokFieldOptions } from '../lib/geocoding';

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

test('buildPurokFieldOptions turns official master lists into strict dropdown options', () => {
  const options = buildPurokFieldOptions({
    masterListPuroks: CUAMBOG_PUROKS,
    householdPuroks: ['Purok Malipayon', 'Purok Typo Entry'],
    currentValue: 'Purok Makugihon',
  });

  assert.equal(options.strict, true);
  assert.equal(options.includesLegacyValue, false);
  // Strict options come from the official list only — household typos never leak in.
  assert.deepEqual(options.officialOptions, [...CUAMBOG_PUROKS].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  ));
  // Suggestions still merge official + existing household puroks for the fallback.
  assert.ok(options.suggestions.includes('Purok Typo Entry'));
});

test('buildPurokFieldOptions keeps a legacy saved value visible in strict mode', () => {
  const options = buildPurokFieldOptions({
    masterListPuroks: CUAMBOG_PUROKS,
    householdPuroks: [],
    currentValue: 'purok malipayon', // same purok, different spelling — normalizes into the list
  });

  assert.equal(options.strict, true);
  assert.equal(options.includesLegacyValue, false);
  assert.deepEqual(options.officialOptions, [...CUAMBOG_PUROKS].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  ));

  const legacy = buildPurokFieldOptions({
    masterListPuroks: CUAMBOG_PUROKS,
    householdPuroks: [],
    currentValue: 'Purok Lumang Ngalan', // genuinely not in the official list
  });

  assert.equal(legacy.strict, true);
  assert.equal(legacy.includesLegacyValue, true);
  assert.ok(legacy.officialOptions.includes('Purok Lumang Ngalan'));
  assert.equal(legacy.officialOptions.length, CUAMBOG_PUROKS.length + 1);
});

test('buildPurokFieldOptions falls back to free-text suggestions without a master list', () => {
  const options = buildPurokFieldOptions({
    masterListPuroks: [],
    householdPuroks: ['prk 3', 'Lower Riverside'],
    currentValue: 'Purok 3',
  });

  assert.equal(options.strict, false);
  assert.deepEqual(options.officialOptions, []);
  assert.deepEqual(options.suggestions, ['Lower Riverside', 'Purok 3']);
});
