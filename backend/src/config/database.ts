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

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

export function getUnscopedPrisma() {
  return prisma;
}

// Cache one extended client per process; it reads ALS context per-operation.
let tenantClient: ReturnType<typeof buildTenantClient> | undefined;

function buildTenantClient() {
  // ext is declared before assignment so the findUnique branch can reference it
  // via closure (by the time any operation fires, ext is fully initialized).
  let ext: ReturnType<typeof prisma.$extends>;
  ext = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const table = modelToTable(model);
          if (isUnscoped(table)) {
            return query(args);
          }

          const ctx = getTenantContext();
          if (!ctx) throw new MissingTenantContextError();

          // 1. Inject write scope
          if (operation === 'create') {
            args.data = args.data || {};
            args.data.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              args.data.storeId = ctx.storeId;
            }
          } else if (operation === 'createMany') {
            if (args.data) {
              const list = Array.isArray(args.data) ? args.data : [args.data];
              for (const item of list) {
                item.tenantId = ctx.tenantId;
                if (ctx.storeId != null && isStoreScoped(table)) {
                  item.storeId = ctx.storeId;
                }
              }
            }
          }

          // 2. Inject read/update/delete filters
          if (['findFirst', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
            args.where = args.where || {};
            args.where.tenantId = ctx.tenantId;
            if (ctx.storeId != null && isStoreScoped(table)) {
              args.where.storeId = ctx.storeId;
            }
          } else if (operation === 'findUnique') {
            // Prisma findUnique requires the where clause to satisfy a unique constraint
            // exactly — you cannot append tenantId to a single-column unique lookup.
            // Fix: redirect to findFirst on the EXTENDED client (ext, not base prisma)
            // so other extension hooks still apply. The closure ref is safe because ext
            // is fully assigned before any operation is ever invoked.
            const modelKey = (model.charAt(0).toLowerCase() + model.slice(1)) as keyof typeof ext;
            const newArgs = {
              where: { ...args.where, tenantId: ctx.tenantId,
                ...(ctx.storeId != null && isStoreScoped(table) ? { storeId: ctx.storeId } : {}) },
            };
            return (ext[modelKey] as any).findFirst(newArgs);
          }

          return query(args);
        },
      },
    },
  });
  return ext;
}

export function getTenantPrisma() {
  if (!tenantClient) tenantClient = buildTenantClient();
  return tenantClient;
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
