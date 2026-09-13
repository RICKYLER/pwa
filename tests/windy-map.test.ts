import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getWindyLayerOption,
  isWindyLayerId,
  isWindyLayerOptionEnabled,
  isWindyAvailable,
  resolveWindyApiKey,
  WINDY_LAYER_OPTIONS,
  WINDY_MAP_PAGE_URL,
  WINDY_TESTING_ALLOWED_OVERLAYS,
} from '../lib/windy-map';

describe('windy layer options', () => {
  it('offers exactly the five documented selector options in order', () => {
    assert.deepEqual(
      WINDY_LAYER_OPTIONS.map((option) => option.id),
      ['none', 'wind', 'temp', 'rain', 'clouds'],
    );
  });

  it('maps every option to the expected Windy overlay id', () => {
    assert.equal(getWindyLayerOption('none').windyOverlay, null);
    assert.equal(getWindyLayerOption('wind').windyOverlay, 'wind');
    assert.equal(getWindyLayerOption('temp').windyOverlay, 'temp');
    assert.equal(getWindyLayerOption('rain').windyOverlay, 'rain');
    assert.equal(getWindyLayerOption('clouds').windyOverlay, 'clouds');
  });

  it('falls back to the none option for unknown ids', () => {
    assert.equal(getWindyLayerOption('bogus' as never).id, 'none');
  });

  it('validates layer ids', () => {
    assert.equal(isWindyLayerId('wind'), true);
    assert.equal(isWindyLayerId('none'), true);
    assert.equal(isWindyLayerId('thunder'), false);
    assert.equal(isWindyLayerId(42), false);
  });
});

describe('windy api key resolution', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(resolveWindyApiKey('  abc123  '), 'abc123');
  });

  it('treats missing values as empty', () => {
    assert.equal(resolveWindyApiKey(undefined), '');
    assert.equal(resolveWindyApiKey(''), '');
  });

  it('availability follows the resolved key', () => {
    // The default export path reads the inlined env var; without one configured
    // in the test run this asserts the "unavailable" branch, and with one set
    // it asserts availability — both are valid outcomes, so only check consistency.
    assert.equal(isWindyAvailable(), resolveWindyApiKey(process.env.NEXT_PUBLIC_WINDY_API_KEY) !== '');
  });
});

describe('windy tier gating', () => {
  it('keeps the none option selectable regardless of tier', () => {
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('none'), []), true);
  });

  it('disables overlays outside the allowed list once Windy reports', () => {
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('wind'), ['wind', 'temp', 'pressure']), true);
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('rain'), ['wind', 'temp', 'pressure']), false);
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('clouds'), ['wind', 'temp', 'pressure']), false);
  });

  it('assumes the documented testing tier until Windy reports its allowed overlays', () => {
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('wind'), null), true);
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('temp'), null), true);
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('rain'), null), false);
    assert.equal(isWindyLayerOptionEnabled(getWindyLayerOption('clouds'), null), false);
    assert.deepEqual([...WINDY_TESTING_ALLOWED_OVERLAYS], ['wind', 'temp', 'pressure']);
  });

  it('points the underlay iframe at the bundled static page', () => {
    assert.equal(WINDY_MAP_PAGE_URL, '/windy-map.html');
  });
});
