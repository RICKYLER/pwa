import os from 'node:os';
import path from 'node:path';

function readEnv(name: string) {
  return process.env[name]?.trim();
}

export function resolveWritableDataDir() {
  const configuredDir = readEnv('MSWDO_DATA_DIR');
  if (configuredDir) return configuredDir;

  if (process.env.VERCEL) {
    return path.join(os.tmpdir(), 'mswdo-data');
  }

  return path.join(process.cwd(), 'data');
}

export function resolveWritableFilePath(envVarName: string, fallbackFileName: string) {
  const configuredPath = readEnv(envVarName);
  if (configuredPath) return configuredPath;

  return path.join(resolveWritableDataDir(), fallbackFileName);
}
