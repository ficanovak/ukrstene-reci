import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient bound to the TEST database.
 *
 * Mirrors src/db/client.ts (Prisma 7 connects through a driver adapter), but is
 * intended only for integration tests. DATABASE_URL is set by the Vitest global
 * setup (test/globalSetup.ts) and by the per-process env loaded in
 * vitest.config.ts, so it points at ukrstene_test.
 */
const connectionString = process.env.DATABASE_URL;

// The `?schema=` param is a Prisma-ism; the underlying pg driver ignores it, so
// we read it off the URL and hand it to the adapter as the query schema. This
// keeps generated queries pointed at the isolated `ukrstene` schema.
const schema = connectionString
  ? new URL(connectionString).searchParams.get('schema') ?? undefined
  : undefined;

const adapter = new PrismaPg({ connectionString }, schema ? { schema } : undefined);

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
  const qualifier = schema ? `"${schema}".` : '';
  const list = TABLES.map((t) => `${qualifier}"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}
