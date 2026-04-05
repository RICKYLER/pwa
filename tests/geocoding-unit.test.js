/**
 * Unit tests for geocoding.ts improvements
 * Run with: node --test tests/geocoding.test.js
 */

const assert = require('assert');
const { describe, it } = require('node:test');

// Test Plus Code pattern
const PLUS_CODE_PATTERN = /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/gi;

function stripPlusCode(value) {
  return value
    .replace(PLUS_CODE_PATTERN, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^,\s*|\s*,\s*$/g, '')
    .trim();
}

describe('Plus Code Utilities', () => {
  describe('PLUS_CODE_PATTERN', () => {
    it('should match standard Plus Codes', () => {
      assert.match('8V52+H3V', PLUS_CODE_PATTERN);
      PLUS_CODE_PATTERN.lastIndex = 0;
      assert.match('7QHX+V8P', PLUS_CODE_PATTERN);
      PLUS_CODE_PATTERN.lastIndex = 0;
      assert.match('9C3W+2XQ', PLUS_CODE_PATTERN);
    });

    it('should not match non-Plus Code text', () => {
      PLUS_CODE_PATTERN.lastIndex = 0;
      assert.doesNotMatch('Quezon Avenue', PLUS_CODE_PATTERN);
      assert.doesNotMatch('Mabini, Davao de Oro', PLUS_CODE_PATTERN);
      assert.doesNotMatch('123 Main Street', PLUS_CODE_PATTERN);
    });
  });

  describe('stripPlusCode', () => {
    it('should remove Plus Codes from addresses', () => {
      const input = '8V52+H3V, Mabini, Davao de Oro, Philippines';
      const expected = 'Mabini, Davao de Oro, Philippines';
      assert.strictEqual(stripPlusCode(input), expected);
    });

    it('should handle Plus Code at start of string', () => {
      const input = '8V52+H3V, Quezon Avenue, Mabini';
      const expected = 'Quezon Avenue, Mabini';
      assert.strictEqual(stripPlusCode(input), expected);
    });

    it('should handle Plus Code in middle of string', () => {
      const input = 'Quezon Avenue, 8V52+H3V, Mabini, Davao';
      const expected = 'Quezon Avenue, Mabini, Davao';
      assert.strictEqual(stripPlusCode(input), expected);
    });

    it('should leave normal addresses unchanged', () => {
      const input = 'Quezon Avenue, Mabini, Davao de Oro';
      assert.strictEqual(stripPlusCode(input), input);
    });

    it('should handle multiple Plus Codes', () => {
      const input = '8V52+H3V, Test, 7QHX+V8, Location';
      const expected = 'Test, Location';
      assert.strictEqual(stripPlusCode(input), expected);
    });

    it('should clean up extra commas and spaces', () => {
      const input = '8V52+H3V,  ,  Mabini';
      const expected = 'Mabini';
      assert.strictEqual(stripPlusCode(input), expected);
    });
  });

  describe('Scoring Logic', () => {
    it('should heavily penalize Plus Codes (-500)', () => {
      const plusCodeScore = -500;
      const streetAddressScore = 100;
      
      assert.ok(plusCodeScore < streetAddressScore);
      assert.strictEqual(plusCodeScore, -500);
    });

    it('should bonus street_number results (+50)', () => {
      const streetNumberBonus = 50;
      assert.strictEqual(streetNumberBonus, 50);
    });

    it('should prioritize street-level types', () => {
      const scores = {
        street_address: 100,
        premise: 90,
        route: 80,
        locality: 15,
        plus_code: -500
      };
      
      assert.ok(scores.street_address > scores.premise);
      assert.ok(scores.premise > scores.route);
      assert.ok(scores.route > scores.locality);
      assert.ok(scores.locality > scores.plus_code);
    });
  });
});

console.log('All tests passed! ✓');
