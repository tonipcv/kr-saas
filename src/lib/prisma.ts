import { PrismaClient } from '@prisma/client';

/* eslint-disable no-var */
declare global {
  var prisma: PrismaClient | undefined;
}
/* eslint-enable no-var */

// Configurar a URL do banco com parâmetros de connection pool
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:5fc578abcbdf1f226aab@dpbdp1.easypanel.host:3245/servidor?sslmode=disable&connection_limit=20&pool_timeout=20';

// Prevenir múltiplas instâncias do Prisma Client em desenvolvimento
// e garantir uma única instância em produção
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
};

// Usar o objeto global para armazenar a instância entre hot-reloads em desenvolvimento
// ou criar uma nova instância em produção
export const prisma = globalThis.prisma ?? prismaClientSingleton();

// Sempre armazenar no objeto global, independente do ambiente
globalThis.prisma = prisma;