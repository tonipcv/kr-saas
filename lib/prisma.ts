import { PrismaClient } from '@prisma/client';

// Global singleton (all environments) to prevent exhausting DB connections
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient() {
  const client = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL },
    },
    log: [
      { level: 'error', emit: 'event' },
      { level: 'warn', emit: 'event' },
    ],
    errorFormat: 'colorless',
  });
  // Basic listeners to help diagnose pool pressure/timeouts
  client.$on('warn', (e) => {
    try { console.warn('[prisma][warn]', e.message); } catch {}
  });
  client.$on('error', (e) => {
    try { console.error('[prisma][error]', e.message); } catch {}
  });
  return client;
}

export const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;