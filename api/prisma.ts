import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv();

declare const globalThis: {
  prisma?: PrismaClient;
};

const resolvedDatabaseUrl =
  process.env.DATABASE_DIRECT_URL ||
  process.env.DATABASE_URL_EXTERNAL ||
  process.env.DATABASE_URL;

if (!resolvedDatabaseUrl) {
  throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set for Prisma to connect.');
}

const prisma = globalThis.prisma ?? new PrismaClient({
  datasources: {
    db: { url: resolvedDatabaseUrl }
  }
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;

  const usingRailwayInternal =
    process.env.DATABASE_URL?.includes('postgres.railway.internal') &&
    !process.env.RAILWAY_ENVIRONMENT;

  if (usingRailwayInternal && !process.env.DATABASE_DIRECT_URL) {
    console.warn('DATABASE_URL points to a Railway internal host. Set DATABASE_DIRECT_URL for local/dev access.');
  }
}

export { prisma };
