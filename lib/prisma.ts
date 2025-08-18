import { PrismaClient } from '@prisma/client';

// Ensure global singleton in dev to avoid exhausting connection pool on hot reloads
const globalForPrisma = global as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Read URL from env to avoid hardcoded schema URL at runtime
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}