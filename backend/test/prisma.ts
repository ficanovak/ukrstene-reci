import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { parseSchemaFromUrl } from '../src/db/connection.js';

/**
 * PrismaClient bound to the TEST database.
 *
 * Mirrors src/db/client.ts (Prisma 7 connects through a driver adapter), but is
 * intended only for integration tests. DATABASE_URL is set by the Vitest global
 * setup (test/globalSetup.ts) and by the per-process env loaded in
 * vitest.config.ts, so it points at ukrstene_test.
 */
const connectionString = process.env.DATABASE_URL;

// The pg adapter ignores the `?schema=` param, so we parse it off the URL and
// hand it to the adapter to keep queries pointed at the isolated schema.
const schema = parseSchemaFromUrl(connectionString);

const adapter = new PrismaPg({ connectionString }, { schema });

export const prisma = new PrismaClient({ adapter });

// Tables that hold test data, ordered so a single TRUNCATE ... CASCADE clears
// everything regardless of FK direction. CASCADE makes the order moot, but we
// keep the full list explicit so new tables are deliberately accounted for.
const TABLES = [
  'user_progress',
  'clues',
  'personalities',
  'levels',
  'dictionary',
  'languages',
  'users',
] as const;

/** Truncate all application tables (RESTART IDENTITY, CASCADE) between tests. */
export async function truncateAll(): Promise<void> {
  const list = TABLES.map((t) => `"${schema}"."${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}
