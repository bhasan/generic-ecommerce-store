import { ZodType } from 'zod';
import { getTenantPrisma } from '../config/database';
import { AppError } from '../middleware/error.middleware';
import { TtlCache } from '../utils/ttlCache';

// Module-level cache shared across all SettingsStore instances, keyed by `key`.
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

export interface SettingsStoreConfig<T> {
  key: string;
  schema: ZodType<T>;
  /** Static defaults, or a factory called fresh on each read (e.g. when defaults depend on env). */
  defaults: T | (() => T);
  onRead?: (raw: T) => T;
  onWrite?: (data: T) => T;
}

export class SettingsStore<T extends object> {
  constructor(private readonly config: SettingsStoreConfig<T>) {}

  private resolveDefaults(): T {
    const { defaults } = this.config;
    return typeof defaults === 'function' ? (defaults as () => T)() : structuredClone(defaults);
  }

  async read(): Promise<T> {
    const { key, onRead } = this.config;
    const cached = settingsCache.get(key) as T | undefined;
    if (cached !== undefined) return structuredClone(cached);

    const row = await getTenantPrisma().uiSetting.findUnique({ where: { key } });
    const merged = row
      ? ({ ...this.resolveDefaults(), ...(row.value as unknown as Partial<T>) } as T)
      : this.resolveDefaults();
    const result = onRead ? onRead(merged) : merged;
    settingsCache.set(key, result as object);
    return structuredClone(result);
  }

  async write(data: T): Promise<T> {
    const { key, schema, onWrite } = this.config;
    const validated = parseOrThrow(schema, data);
    const toStore = onWrite ? onWrite(validated) : validated;
    await getTenantPrisma().uiSetting.upsert({
      where: { key },
      update: { value: toStore as object },
      create: { key, value: toStore as object },
    });
    settingsCache.delete(key);
    return validated;
  }
}
