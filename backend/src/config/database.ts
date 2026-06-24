import { PrismaClient } from '../../generated/prisma';

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
