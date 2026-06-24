import { PrismaClient } from '../../generated/prisma';

// Singleton Prisma Client instance
const prismaClientSingleton = () => {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/app');
  if (process.env.DB_CONNECTION_LIMIT && !url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', process.env.DB_CONNECTION_LIMIT);
  }
  if (process.env.DB_POOL_TIMEOUT && !url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', process.env.DB_POOL_TIMEOUT);
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
