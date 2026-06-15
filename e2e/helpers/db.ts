import { spawnSync } from 'child_process';

const BACKEND_HEALTH_URL = 'http://localhost:3000/api/health';
const DEV_DB_PORT = '15432';
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120_000;

async function waitForBackend(): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BACKEND_HEALTH_URL);
      if (res.ok) return;
    } catch {
      // backend not up yet
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Backend did not become healthy within ${MAX_WAIT_MS / 1000}s. ` +
    `Is the stack running? (docker compose -f docker-compose.yml -f docker-compose.dev.yml up)`
  );
}

function assertDevDb(): void {
  const url = process.env.DATABASE_URL ?? '';
  // DATABASE_URL is set inside the backend container; from the host we check
  // the docker-compose port mapping instead. If DATABASE_URL is set on the host
  // it must point at the dev port (15432) or localhost to be safe.
  if (url && !url.includes(DEV_DB_PORT) && !url.includes('localhost') && !url.includes('127.0.0.1')) {
    throw new Error(
      `DATABASE_URL does not look like the dev DB (expected port ${DEV_DB_PORT} or localhost). ` +
      `Refusing to reseed to protect non-dev data.\nDATABASE_URL=${url}`
    );
  }
}

export async function reseedDevDb(): Promise<void> {
  assertDevDb();
  console.log('[db] Waiting for backend to be healthy...');
  await waitForBackend();
  console.log('[db] Backend healthy. Reseeding dev DB...');
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.dev.yml', 'exec', '-T', 'backend', 'npm', 'run', 'prisma:seed'],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error(`Reseed failed with exit code ${result.status}`);
  }
  console.log('[db] Reseed complete.');
}
