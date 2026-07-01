import { spawnSync } from 'child_process';

const BACKEND_HEALTH_URL = 'http://localhost:3000/api/health';
const DB_CONTAINER = 'smoke-station-delivery-db';
const DB_USER = 'backend_user';
const DB_NAME = 'smoke-station-delivery-db';
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

// ─── Direct-DB helpers (psql via docker exec) ────────────────────────────────
// Used by e2e specs that need to seed rows that have no admin API endpoint yet
// (e.g. non-default stores, StoreVariantOverrides for per-store stock tests).

/**
 * Run a SQL statement inside the DB container via psql.
 * Flags: -A (unaligned) -t (tuples only) so the output is plain values.
 * For DML with RETURNING, the first line of output is the returned value;
 * subsequent lines are the PostgreSQL command tag (e.g. "INSERT 0 1").
 */
function execPsql(sql: string): string {
  const result = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-A', '-t'],
    { input: sql + '\n', encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (result.status !== 0) {
    throw new Error(`execPsql failed (exit ${result.status}): ${result.stderr}`);
  }
  return result.stdout.trim();
}

/** Return the integer `id` of the default ('app') tenant. */
export function getDefaultTenantId(): number {
  const out = execPsql("SELECT id FROM tenants WHERE slug = 'app' LIMIT 1");
  const id = parseInt(out.split('\n')[0].trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`getDefaultTenantId: unexpected output "${out}"`);
  }
  return id;
}

/**
 * Insert a non-default ACTIVE store under `tenantId` and return its generated id.
 * Use a timestamp in the slug to avoid unique-constraint collisions on re-runs
 * without a reseed.
 */
export function createTestStore(tenantId: number, slug: string, name: string): number {
  const safeName = name.replace(/'/g, "''");
  const safeSlug = slug.replace(/'/g, "''");
  const out = execPsql(
    `INSERT INTO stores (name, slug, "isDefault", status, "tenantId", "createdAt", "updatedAt") ` +
    `VALUES ('${safeName}', '${safeSlug}', false, 'ACTIVE', ${tenantId}, now(), now()) RETURNING id`,
  );
  // First line of output is the returned id; second is "INSERT 0 1".
  const id = parseInt(out.split('\n')[0].trim(), 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`createTestStore: unexpected output "${out}"`);
  }
  return id;
}

/**
 * Insert a StoreVariantOverride for the given store + variant.
 * stock_variant_overrides has @@unique([storeId, variantId]); using a fresh
 * storeId each test run keeps this safe across re-runs.
 *
 * Optional params (backward-compatible — existing callers omit them):
 *   priceOverride  – decimal price override stored in "priceOverride" column.
 *                    Omitted from SQL when undefined so the DB default (NULL) applies.
 *   activeOverride – boolean stored in "activeOverride" column.
 *                    Omitted from SQL when undefined.
 */
export function createStoreVariantOverride(
  tenantId: number,
  storeId: number,
  variantId: number,
  stock: number,
  priceOverride?: number,
  activeOverride?: boolean,
): void {
  const extraCols =
    (priceOverride !== undefined ? ', "priceOverride"' : '') +
    (activeOverride !== undefined ? ', "activeOverride"' : '');
  const extraVals =
    (priceOverride !== undefined ? `, ${priceOverride}` : '') +
    (activeOverride !== undefined ? `, ${activeOverride}` : '');

  execPsql(
    `INSERT INTO store_variant_overrides ("tenantId", "storeId", "variantId", stock${extraCols}, "createdAt", "updatedAt") ` +
    `VALUES (${tenantId}, ${storeId}, ${variantId}, ${stock}${extraVals}, now(), now())`,
  );
}

/**
 * Delete a test store by id. The StoreVariantOverride rows cascade-delete
 * automatically via the FK (onDelete: Cascade on StoreVariantOverride → Store).
 */
export function deleteTestStore(storeId: number): void {
  execPsql(`DELETE FROM stores WHERE id = ${storeId}`);
}

// ─────────────────────────────────────────────────────────────────────────────

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
