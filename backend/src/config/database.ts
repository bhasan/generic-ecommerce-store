import { PrismaClient } from '../../generated/prisma';
import { getTenantContext, MissingTenantContextError } from './tenantContext';
import { isUnscoped, isStoreScoped } from './tenantScope';

function parsePositiveIntEnv(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// Singleton Prisma Client instance
const prismaClientSingleton = () => {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/app');
  const connectionLimit = parsePositiveIntEnv(process.env.DB_CONNECTION_LIMIT);
  if (connectionLimit !== undefined && !url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(connectionLimit));
  }
  const poolTimeout = parsePositiveIntEnv(process.env.DB_POOL_TIMEOUT);
  if (poolTimeout !== undefined && !url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(poolTimeout));
  }
  return new PrismaClient({
    datasources: { db: { url: url.toString() } },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

const basePrisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

export function getUnscopedPrisma() {
  return basePrisma;
}

// Build the tenant-scoped client. The $extends interceptor is internally typed
// `any` (Prisma's extension types can't express the tenant injection), but it
// preserves every model delegate's signature, so we expose it to callers as the
// base PrismaClient type. Without this annotation the export is `any`, which
// silently disables type-checking for EVERY consumer of the scoped client
// (e.g. `prisma.x.findMany().map(row => …)` → `row` becomes implicit-any).
const prisma: PrismaClientSingleton = buildTenantClient(basePrisma);

export default prisma;

export function getTenantPrisma(): PrismaClientSingleton {
  return prisma;
}

function buildTenantClient(prismaInstance: any) {
  let ext: any;
  ext = prismaInstance.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const table = modelToTable(model);
          if (isUnscoped(table)) {
            return query(args);
          }

          const ctx = getTenantContext();
          if (!ctx) {
            // Fail closed wherever isolation must be trustworthy: production AND
            // CI/test (so a missing-context regression turns the build red).
            // `process.env.VITEST` is set by the Vitest runner; this container
            // runs with NODE_ENV=development permanently so we cannot rely on
            // NODE_ENV=test — VITEST acts as the authoritative "running under test
            // suite" signal. Both checks are kept so the guard also works in
            // environments that correctly set NODE_ENV=test without Vitest.
            // Dev/script execution (NODE_ENV unset or 'development', no VITEST)
            // keeps a logged pass-through for ad-hoc scripts; the sanctioned
            // context-free path everywhere is getUnscopedPrisma().
            if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || !!process.env.VITEST) {
              throw new MissingTenantContextError();
            }
            // eslint-disable-next-line no-console
            console.warn(
              `[tenant] scoped op "${operation}" on "${table}" ran with no tenant context (dev pass-through)`,
            );
            return query(args);
          }

          const anyArgs = args as any;

          // 1. Inject write scope
          if (operation === 'create') {
            anyArgs.data = anyArgs.data || {};
            anyArgs.data.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              anyArgs.data.storeId = ctx.storeId;
            }
            injectNestedRelations(anyArgs.data, ctx);
          } else if (operation === 'update') {
            if (anyArgs.data) {
              injectNestedRelations(anyArgs.data, ctx);
            }
          } else if (operation === 'upsert') {
            anyArgs.create = anyArgs.create || {};
            anyArgs.create.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              anyArgs.create.storeId = ctx.storeId;
            }
            anyArgs.update = anyArgs.update || {};
            anyArgs.update.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              anyArgs.update.storeId = ctx.storeId;
            }
            injectNestedRelations(anyArgs.create, ctx);
            injectNestedRelations(anyArgs.update, ctx);
          } else if (operation === 'createMany') {
            if (anyArgs.data) {
              const list = Array.isArray(anyArgs.data) ? anyArgs.data : [anyArgs.data];
              for (const item of list) {
                item.tenantId = ctx.tenantId;
                if (ctx.storeId != null && isStoreScoped(table)) {
                  item.storeId = ctx.storeId;
                }
                injectNestedRelations(item, ctx);
              }
            }
          }

          // 2. Inject read/update/delete filters
          if (['findFirst', 'findFirstOrThrow', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
            anyArgs.where = anyArgs.where || {};
            anyArgs.where.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              anyArgs.where.storeId = ctx.storeId;
            }
          } else if (operation === 'findUnique') {
            // Prisma findUnique requires the where clause to satisfy a unique constraint
            // exactly — you cannot append tenantId to a single-column unique lookup.
            // Fix: redirect to findFirst on the EXTENDED client (ext, not base prisma)
            // so other extension hooks still apply. The closure ref is safe because ext
            // is fully assigned before any operation is ever invoked.
            const modelKey = (model.charAt(0).toLowerCase() + model.slice(1)) as keyof typeof ext;
            
            // Flatten compound unique keys (e.g. tenantId_username: { tenantId, username })
            const flatWhere = { ...anyArgs.where };
            for (const key of Object.keys(flatWhere)) {
              if (key.includes('_') && flatWhere[key] && typeof flatWhere[key] === 'object') {
                Object.assign(flatWhere, flatWhere[key]);
                delete flatWhere[key];
              }
            }

            const newArgs = {
              ...anyArgs, // preserve include / select / etc. — only the where is rewritten
              where: { ...flatWhere, tenantId: ctx.tenantId,
                ...(ctx.storeId != null && isStoreScoped(table) ? { storeId: ctx.storeId } : {}) },
            };
            return (ext[modelKey] as any).findFirst(newArgs);
          } else if (operation === 'findUniqueOrThrow') {
            // Same redirect pattern as findUnique but targeting findFirstOrThrow on the
            // extended client, so "not found → throw" (Prisma NotFoundError) semantics
            // are preserved while tenantId is still injected into the where clause.
            const modelKey = (model.charAt(0).toLowerCase() + model.slice(1)) as keyof typeof ext;
            const flatWhere = { ...anyArgs.where };
            for (const key of Object.keys(flatWhere)) {
              if (key.includes('_') && flatWhere[key] && typeof flatWhere[key] === 'object') {
                Object.assign(flatWhere, flatWhere[key]);
                delete flatWhere[key];
              }
            }
            const newArgs = {
              ...anyArgs,
              where: { ...flatWhere, tenantId: ctx.tenantId,
                ...(ctx.storeId != null && isStoreScoped(table) ? { storeId: ctx.storeId } : {}) },
            };
            return (ext[modelKey] as any).findFirstOrThrow(newArgs);
          }

          return query(anyArgs);
        },
      },
    },
  });
  return ext;
}


// Prisma model name (PascalCase) -> @@map table name. Generated mapping.
function modelToTable(model: string): string {
  const map: Record<string, string> = {
    User: 'users', Product: 'products', Category: 'categories',
    ProductVariant: 'product_variants', ProductImage: 'product_images',
    VariantQuantityOption: 'variant_quantity_options', VariantPriceBreak: 'variant_price_breaks',
    Review: 'reviews', ReviewVote: 'review_votes',
    StoreCreditTransaction: 'store_credit_transactions', UiSetting: 'ui_settings',
    UserRole: 'user_roles', Order: 'orders', OrderItem: 'order_items',
    OrderStatusEvent: 'order_status_events', Payment: 'payments', CartItem: 'cart_items',
    PrintJob: 'print_jobs', PosOutbox: 'pos_outbox', OrderPosMapping: 'order_pos_mappings',
    Announcement: 'announcements', ContactMessage: 'contact_messages',
    Role: 'roles', RefreshToken: 'refresh_tokens', Tenant: 'tenants', Store: 'stores',
    AddressGeocodeCache: 'address_geocode_cache', Notification: 'notifications'
  };
  return map[model] ?? model.toLowerCase();
}

// KNOWN LIMITATION: nested `connect` / `connectOrCreate` inside write args are NOT
// tenant-validated by this function. The connected row is matched by its global id
// (which Prisma requires for `connect`), so a caller could theoretically connect a
// row that belongs to a different tenant if they supply its id.
//
// Safe usage contract: callers MUST resolve foreign-key ids through the scoped client
// (i.e. via getTenantPrisma() / runWithTenant) BEFORE using them in a `connect`.
// The order, cart, and credit paths already follow this pattern.
//
// We deliberately do NOT auto-scope `connect` here because the correct behaviour is
// not safely generalizable: some connect targets are intentionally cross-tenant (e.g.
// Role, Tenant itself), so a blanket tenantId injection would break those paths.
function injectNestedRelations(data: any, ctx: { tenantId: number; storeId: number | null }) {
  if (!data || typeof data !== 'object') return;

  const tenantScopedFields = ['variants', 'images', 'quantityOptions', 'priceBreaks', 'storeCreditTransactions', 'roles', 'user'];
  const storeScopedFields = ['items', 'payments', 'statusEvents', 'posOutbox', 'posMappings', 'order'];

  for (const key of Object.keys(data)) {
    const val = data[key];
    if (!val || typeof val !== 'object') continue;

    if (tenantScopedFields.includes(key)) {
      applyInjectionToRelation(val, ctx.tenantId, null);
    } else if (storeScopedFields.includes(key)) {
      applyInjectionToRelation(val, ctx.tenantId, ctx.storeId);
    } else {
      injectNestedRelations(val, ctx);
    }
  }
}

function applyInjectionToRelation(relationObj: any, tenantId: number, storeId: number | null) {
  if (!relationObj || typeof relationObj !== 'object') return;

  if (relationObj.create) {
    const list = Array.isArray(relationObj.create) ? relationObj.create : [relationObj.create];
    for (const item of list) {
      if (item && typeof item === 'object') {
        item.tenantId = tenantId;
        if (storeId != null) item.storeId = storeId;
        injectNestedRelations(item, { tenantId, storeId });
      }
    }
  }

  if (relationObj.createMany && relationObj.createMany.data) {
    const list = Array.isArray(relationObj.createMany.data) ? relationObj.createMany.data : [relationObj.createMany.data];
    for (const item of list) {
      if (item && typeof item === 'object') {
        item.tenantId = tenantId;
        if (storeId != null) item.storeId = storeId;
      }
    }
  }

  if (relationObj.update) {
    const list = Array.isArray(relationObj.update) ? relationObj.update : [relationObj.update];
    for (const updateItem of list) {
      const item = updateItem.data || updateItem;
      if (item && typeof item === 'object') {
        item.tenantId = tenantId;
        if (storeId != null) item.storeId = storeId;
        injectNestedRelations(item, { tenantId, storeId });
      }
    }
  }

  if (relationObj.upsert) {
    const list = Array.isArray(relationObj.upsert) ? relationObj.upsert : [relationObj.upsert];
    for (const item of list) {
      if (item && typeof item === 'object') {
        if (item.create && typeof item.create === 'object') {
          item.create.tenantId = tenantId;
          if (storeId != null) item.create.storeId = storeId;
          injectNestedRelations(item.create, { tenantId, storeId });
        }
        if (item.update && typeof item.update === 'object') {
          item.update.tenantId = tenantId;
          if (storeId != null) item.update.storeId = storeId;
          injectNestedRelations(item.update, { tenantId, storeId });
        }
      }
    }
  }
}

