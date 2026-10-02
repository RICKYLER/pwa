import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountToWords } from '../lib/aics/amount-to-words';

test('amountToWords converts integers correctly', () => {
  assert.equal(amountToWords(3000), 'THREE THOUSAND PESOS ONLY');
  assert.equal(amountToWords(500), 'FIVE HUNDRED PESOS ONLY');
  assert.equal(amountToWords(10500), 'TEN THOUSAND FIVE HUNDRED PESOS ONLY');
  assert.equal(amountToWords(100000), 'ONE HUNDRED THOUSAND PESOS ONLY');
});

test('amountToWords handles decimals / centavos correctly', () => {
  assert.equal(
    amountToWords(3500.5),
    'THREE THOUSAND FIVE HUNDRED PESOS & 50/100 ONLY'
  );
  assert.equal(
    amountToWords(1250.75),
    'ONE THOUSAND TWO HUNDRED FIFTY PESOS & 75/100 ONLY'
  );
});

test('amountToWords handles edge cases (0, negative, strings)', () => {
  assert.equal(amountToWords(0), 'ZERO PESOS ONLY');
  assert.equal(amountToWords('4000'), 'FOUR THOUSAND PESOS ONLY');
  assert.equal(amountToWords(-100), 'ZERO PESOS ONLY');
});
