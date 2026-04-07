import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReportsAgePreviewData,
  buildReportsHouseholdPreviewData,
  buildReportsVulnerabilityPreviewData,
  getReportsVulnerableTotal,
  type ReportsPreviewStats,
} from '../lib/reports-preview-data';

const sampleStats: ReportsPreviewStats = {
  total_households: 14,
  total_population: 32,
  children_count: 9,
  seniors_count: 5,
  pwd_count: 3,
  pregnant_count: 2,
  chronic_count: 1,
  low_income_count: 7,
};

test('age preview data keeps child adult and senior slices for the donut card', () => {
  assert.deepEqual(buildReportsAgePreviewData(sampleStats), [
    { key: 'children', label: 'Children', value: 9, shortLabel: 'Chi' },
    { key: 'adults', label: 'Adults', value: 18, shortLabel: 'Adu' },
    { key: 'seniors', label: 'Seniors', value: 5, shortLabel: 'Sen' },
  ]);
});

test('vulnerability preview data keeps every supported category', () => {
  assert.deepEqual(buildReportsVulnerabilityPreviewData(sampleStats), [
    { key: 'children', label: 'Children', value: 9, shortLabel: 'Chil' },
    { key: 'seniors', label: 'Seniors', value: 5, shortLabel: 'Seni' },
    { key: 'pwd', label: 'PWD', value: 3, shortLabel: 'PWD' },
    { key: 'pregnant', label: 'Pregnant', value: 2, shortLabel: 'Preg' },
    { key: 'chronic', label: 'Chronic', value: 1, shortLabel: 'Chro' },
    { key: 'lowIncome', label: 'Low-income', value: 7, shortLabel: 'Low' },
  ]);
  assert.equal(getReportsVulnerableTotal(sampleStats), 20);
});

test('household preview data applies rank and short labels for mini purok bars', () => {
  assert.deepEqual(buildReportsHouseholdPreviewData([
    { purok: 'Purok 1', households: 4 },
    { purok: 'Purok 2', households: 2 },
    { purok: 'Sitio A', households: 1 },
  ], 2), [
    { key: 'households-1', purok: 'Purok 1', households: 4, rank: 1, shortLabel: 'P1' },
    { key: 'households-2', purok: 'Purok 2', households: 2, rank: 2, shortLabel: 'P2' },
  ]);
});
