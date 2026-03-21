import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = process.cwd();

async function assertFileExists(relativePath: string) {
  await access(path.join(projectRoot, relativePath));
}

test('manifest icon and shortcut assets exist on disk', async () => {
  const manifestPath = path.join(projectRoot, 'public/manifest.json');
  const rawManifest = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(rawManifest) as {
    icons?: Array<{ src: string }>;
    shortcuts?: Array<{ icons?: Array<{ src: string }> }>;
  };

  const referencedAssets = new Set<string>();

  manifest.icons?.forEach((icon) => referencedAssets.add(icon.src.replace(/^\//, 'public/')));
  manifest.shortcuts?.forEach((shortcut) => {
    shortcut.icons?.forEach((icon) => referencedAssets.add(icon.src.replace(/^\//, 'public/')));
  });

  for (const asset of referencedAssets) {
    await assertFileExists(asset);
  }
});

test('offline shell and service worker files exist', async () => {
  await assertFileExists('public/sw.js');
  await assertFileExists('app/offline/page.tsx');
  await assertFileExists('public/apple-icon.png');
  await assertFileExists('public/icon-192.png');
  await assertFileExists('public/icon-512.png');
  await assertFileExists('public/maskable-icon-512.png');
  assert.ok(true);
});
