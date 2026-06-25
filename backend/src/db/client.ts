import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { parseSchemaFromUrl } from './connection.js';

// Prisma 7 connects through a driver adapter. The pg adapter does NOT read the
// `?schema=ukrstene` param from the connection string, so we parse it off
// DATABASE_URL ourselves and pass it as the adapter's `schema` to keep queries
// pointed at the isolated `ukrstene` schema (where migrations live).
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  const schema = parseSchemaFromUrl(connectionString);
  const adapter = new PrismaPg({ connectionString }, { schema });
  return new PrismaClient({ adapter });
}

// Reuse a single PrismaClient across hot reloads in development to avoid
// exhausting database connections. In production a fresh instance is created.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
