import fs from 'node:fs';
import path from 'node:path';

const liveDir = path.resolve(process.cwd(), 'tests/live');
const reportsDir = path.join(liveDir, 'reports');

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(path.join(liveDir, '.env.production'));
loadEnvFile(path.join(liveDir, '.env.local'));

const baseUrl = (
  process.env.SMOKE_STATION_LIVE_BASE_URL
  || process.env.SMOKE_STATION_WEB_BASE_URL
  || 'http://localhost:5843'
).replace(/\/$/, '');

const apiBaseUrl = (
  process.env.SMOKE_STATION_LIVE_API_BASE_URL
  || process.env.SMOKE_STATION_API_BASE_URL
  || (baseUrl.includes('5843') ? 'http://localhost:3000/api' : `${baseUrl}/api`)
).replace(/\/$/, '');

export const liveEnv = {
  liveDir,
  reportsDir,
  baseUrl,
  apiBaseUrl,
  timeoutMs: Number(process.env.SMOKE_STATION_LIVE_TIMEOUT_MS || 30000),
  allowSafeWrites: process.env.SMOKE_STATION_ALLOW_SAFE_WRITES === 'true',
  allowDestructiveTests: process.env.SMOKE_STATION_ALLOW_DESTRUCTIVE_TESTS === 'true',
  allowProviderTests: process.env.SMOKE_STATION_ALLOW_PROVIDER_TESTS === 'true',
  allowAiTests: process.env.SMOKE_STATION_ALLOW_AI_TESTS === 'true',
  personas: {
    customer: {
      username: process.env.SMOKE_STATION_LIVE_CUSTOMER_USERNAME || process.env.SMOKE_STATION_SMOKE_USERNAME,
      password: process.env.SMOKE_STATION_LIVE_CUSTOMER_PASSWORD || process.env.SMOKE_STATION_SMOKE_PASSWORD,
    },
    manager: {
      username: process.env.SMOKE_STATION_LIVE_MANAGER_USERNAME,
      password: process.env.SMOKE_STATION_LIVE_MANAGER_PASSWORD,
    },
    admin: {
      username: process.env.SMOKE_STATION_LIVE_ADMIN_USERNAME,
      password: process.env.SMOKE_STATION_LIVE_ADMIN_PASSWORD,
    },
    driver: {
      username: process.env.SMOKE_STATION_LIVE_DRIVER_USERNAME,
      password: process.env.SMOKE_STATION_LIVE_DRIVER_PASSWORD,
    },
  },
};

export function hasPersona(name: keyof typeof liveEnv.personas) {
  const persona = liveEnv.personas[name];
  return Boolean(persona.username && persona.password);
}
