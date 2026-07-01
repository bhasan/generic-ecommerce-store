import { ZodType } from 'zod';
import { getTenantPrisma } from '../config/database';
import { getTenantContext } from '../config/tenantContext';
import { AppError } from '../middleware/error.middleware';
import { TtlCache } from '../utils/ttlCache';

// Module-level cache shared across all SettingsStore instances, keyed by
// `${tenantId}:${key}` so one tenant's cached settings can never be served to
// another (the cache is tenant-scoped, mirroring the tenant-scoped DB rows).
// IMPORTANT caveats (do not remove without reading):
//  - Single-process only. The backend runs as one instance today; if it is ever
//    scaled horizontally, each process keeps its own copy and config can be up to
//    one TTL stale between instances. Move to a shared store (e.g. Redis) at that point.
//  - Caching the post-`onRead` result means a `defaults` *factory* (() => T) no longer
//    re-runs per read. That is fine because those factories depend only on env, which
//    does not change at runtime — but it IS a behavior shift worth knowing.
//  - Only safe because settings values are plain JSON (no Decimal/functions/class
//    instances), so `structuredClone` on hits is lossless. Do not cache Prisma graphs here.
const SETTINGS_CACHE_TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS ?? 30_000);
const settingsCache = new TtlCache<object>(SETTINGS_CACHE_TTL_MS);

/** Clears all cached settings. Intended for use in tests only. */
export function clearSettingsCache(): void {
  settingsCache.clear();
}

export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(result.error.issues[0].message, 400);
  }
  return result.data;
}

// Field-wise merge for store-scoped settings: the override wins for any field
// whose value is a non-empty scalar; blank/undefined inherits the default; nested
// plain objects merge per-field. Arrays/scalars replace when non-empty.
function mergeStoreScoped<T>(base: T, override: Partial<T> | undefined): T {
  if (!override) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [k, ov] of Object.entries(override)) {
    const bv = (base as any)[k];
    if (ov === undefined || ov === null || ov === '') continue; // inherit
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object') {
      out[k] = mergeStoreScoped(bv, ov as any);
    } else {
      out[k] = ov;
    }
  }
  return out;
}

export interface SettingsStoreConfig<T> {
  key: string;
  schema: ZodType<T>;
  /** Static defaults, or a factory called fresh on each read (e.g. when defaults depend on env). */
  defaults: T | (() => T);
  onRead?: (raw: T) => T;
  onWrite?: (data: T) => T;
  /**
   * When true, read() fetches the tenant-default row (storeId 0) AND the active
   * store's override row, then merges them (non-blank override wins per field).
   * write() upserts to storeId 0 for the default store, or the active storeId
   * otherwise. Tenant-scoped stores (false/undefined) always read/write storeId 0.
   */
  storeScoped?: boolean;
}

export class SettingsStore<T extends object> {
  constructor(private readonly config: SettingsStoreConfig<T>) {}

  private resolveDefaults(): T {
    const { defaults } = this.config;
    return typeof defaults === 'function' ? (defaults as () => T)() : structuredClone(defaults);
  }

  // Cache key format:
  //   tenant-scoped:  `${tenantId}:${key}`
  //   store-scoped:   `${tenantId}:${effectiveStoreId}:${key}`
  // The DB rows are tenant-scoped via the Prisma extension; the in-memory cache
  // must match or one tenant's cached settings could be served to another.
  // (Context is absent only in dev/scripts; key 0 there is harmless.)
  private cacheKeyFor(key: string): string {
    const ctx = getTenantContext();
    const tenantId = ctx?.tenantId ?? 0;
    if (this.config.storeScoped) {
      const effectiveStoreId = ctx?.isDefaultStore ? 0 : (ctx?.storeId ?? 0);
      return `${tenantId}:${effectiveStoreId}:${key}`;
    }
    return `${tenantId}:${key}`;
  }

  async read(): Promise<T> {
    const { key, onRead, storeScoped } = this.config;
    const cacheKey = this.cacheKeyFor(key);
    const cached = settingsCache.get(cacheKey) as T | undefined;
    if (cached !== undefined) return structuredClone(cached);

    let result: T;
    if (storeScoped) {
      const ctx = getTenantContext();
      const effectiveStoreId = ctx?.isDefaultStore ? 0 : (ctx?.storeId ?? 0);
      // Fetch tenant-default (storeId 0) and active store's override in one query.
      // When effectiveStoreId is 0 the in-list dedupes to [0] (only the default row).
      const storeIds = effectiveStoreId === 0 ? [0] : [0, effectiveStoreId];
      const rows = await getTenantPrisma().uiSetting.findMany({
        where: { key, storeId: { in: storeIds } },
      });
      const row0 = rows.find(r => r.storeId === 0);
      // Only look for a store-override row when we are NOT the default store.
      const rowStore = effectiveStoreId !== 0
        ? rows.find(r => r.storeId === effectiveStoreId)
        : undefined;
      // base = defaults merged with tenant-default row; then overlay the store override.
      const base = { ...this.resolveDefaults(), ...(row0?.value as Partial<T> ?? {}) } as T;
      const merged = mergeStoreScoped(base, rowStore?.value as Partial<T> | undefined);
      result = onRead ? onRead(merged) : merged;
    } else {
      // Tenant-scoped (original behaviour): always read the storeId-0 row.
      // findFirst (not findUnique): unique per (tenantId, storeId, key). The extension
      // injects tenantId; storeId 0 = tenant-default row.
      const row = await getTenantPrisma().uiSetting.findFirst({ where: { key, storeId: 0 } });
      const merged = row
        ? ({ ...this.resolveDefaults(), ...(row.value as unknown as Partial<T>) } as T)
        : this.resolveDefaults();
      result = onRead ? onRead(merged) : merged;
    }
    settingsCache.set(cacheKey, result as object);
    return structuredClone(result);
  }

  async write(data: T): Promise<T> {
    const { key, schema, onWrite, storeScoped } = this.config;
    const ctx = getTenantContext();
    const tenantId = ctx?.tenantId ?? 0;
    const validated = parseOrThrow(schema, data);
    const toStore = onWrite ? onWrite(validated) : validated;
    // For store-scoped stores: write to the active store's row, unless this is the
    // default store (or storeId is null) in which case write to the tenant-default row
    // (storeId 0). Tenant-scoped stores always write to storeId 0.
    const effectiveStoreId = storeScoped
      ? (ctx?.isDefaultStore ? 0 : (ctx?.storeId ?? 0))
      : 0;
    // Composite where: pins the upsert to THIS tenant's row so it can never
    // match/overwrite another tenant's or another store's row.
    // (The extension also injects tenantId into `create`.)
    await getTenantPrisma().uiSetting.upsert({
      where: { tenantId_storeId_key: { tenantId, storeId: effectiveStoreId, key } },
      update: { value: toStore as object },
      create: { key, storeId: effectiveStoreId, value: toStore as object },
    });
    if (storeScoped) {
      // A store-scoped write (even to storeId 0) invalidates cached merges for ALL
      // stores that inherit row 0. TtlCache has no prefix-delete, so clear everything.
      // Settings writes are rare admin actions; the small cache re-warms quickly.
      settingsCache.clear();
    } else {
      settingsCache.delete(this.cacheKeyFor(key));
    }
    return validated;
  }
}
