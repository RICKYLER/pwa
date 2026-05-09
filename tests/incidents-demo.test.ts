import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnownDemoIncident } from '../lib/db/incidents';

test('isKnownDemoIncident recognizes legacy responder demo medical text', () => {
  assert.equal(
    isKnownDemoIncident({
      id: 'inc-legacy-demo',
      type: 'medical',
      location: 'Purok 1, Zone A — House #114',
      description: 'Elderly resident with chest pain. Family unable to transport to hospital.',
    }),
    true,
  );
});

test('isKnownDemoIncident recognizes updated responder demo typhoon text', () => {
  assert.equal(
    isKnownDemoIncident({
      id: 'inc-demo-updated',
      type: 'typhoon',
      location: 'Coastal Purok 7',
      description: 'Pre-emptive typhoon evacuation advisory for low-lying coastal households in Mabini.',
    }),
    true,
  );
});

test('isKnownDemoIncident ignores real incidents outside the known demo fingerprints', () => {
  assert.equal(
    isKnownDemoIncident({
      id: 'inc-real',
      type: 'medical',
      location: 'Purok 1, Zone A — House #114',
      description: 'Resident requests medicine refill after RHU assessment.',
    }),
    false,
  );
});
