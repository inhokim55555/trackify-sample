import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in dev to avoid exhausting
// database connections.
const sampleUrl='postgresql://postgres:postgres@127.0.0.1:16530/postgres?connection_limit=1&pool_timeout=30&pgbouncer=true&statement_cache_size=0';
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources:{db:{url:sampleUrl}},
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
