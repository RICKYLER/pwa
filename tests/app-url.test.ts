import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAppUrl } from '../lib/server/app-url';

const ORIGINAL_ENV = {
  APP_URL: process.env.APP_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  VERCEL_URL: process.env.VERCEL_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test.afterEach(restoreEnv);

test('development requests from a LAN host override localhost app URL config', () => {
  process.env.NODE_ENV = 'development';
  process.env.APP_URL = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

  assert.equal(
    resolveAppUrl('http://192.168.1.25:3000/api/distribution/qr'),
    'http://192.168.1.25:3000',
  );
});

test('development keeps configured app URL when it is not localhost', () => {
  process.env.NODE_ENV = 'development';
  process.env.APP_URL = 'https://mswdo.example.test';

  assert.equal(
    resolveAppUrl('http://192.168.1.25:3000/api/distribution/qr'),
    'https://mswdo.example.test',
  );
});

test('production prefers configured non-local app URL', () => {
  process.env.NODE_ENV = 'production';
  process.env.APP_URL = 'https://mswdo.example.test';

  assert.equal(
    resolveAppUrl('http://192.168.1.25:3000/api/distribution/qr'),
    'https://mswdo.example.test',
  );
});
