import assert from 'node:assert/strict';
import test from 'node:test';
import { isLegacySampleIncident } from '../lib/incident-filters';

test('legacy sample flood incident is filtered out', () => {
  assert.equal(
    isLegacySampleIncident({
      id: 'inc_legacy_1',
      type: 'flood',
      location: 'Purok 3, Sitio Malabog',
      description: 'Floodwater rising - 12 families need immediate evacuation. Road impassable.',
    }),
    true,
  );
});

test('real incident with same location but different details is kept', () => {
  assert.equal(
    isLegacySampleIncident({
      id: 'inc_real_1',
      type: 'flood',
      location: 'Purok 3, Sitio Malabog',
      description: 'Actual report from Mabini responder after barangay assessment.',
    }),
    false,
  );
});
