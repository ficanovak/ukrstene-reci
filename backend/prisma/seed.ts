import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { parseSchemaFromUrl } from '../src/db/connection.js';

/**
 * The 5 supported languages with their writing systems.
 *
 *   sr → Srpski      → Cyrillic + Latin
 *   hr → Hrvatski    → Latin
 *   bs → Bosanski    → Latin
 *   me → Crnogorski  → Latin
 *   mk → Makedonski  → Cyrillic
 */
const LANGUAGES = [
  { code: 'sr', name: 'Srpski', supportedScripts: ['cyr', 'lat'] },
  { code: 'hr', name: 'Hrvatski', supportedScripts: ['lat'] },
  { code: 'bs', name: 'Bosanski', supportedScripts: ['lat'] },
  { code: 'me', name: 'Crnogorski', supportedScripts: ['lat'] },
  { code: 'mk', name: 'Makedonski', supportedScripts: ['cyr'] },
] as const;

/**
 * Insert (or update) the supported languages.
 *
 * Idempotent: upserts by the unique `code`, so running it repeatedly leaves
 * exactly one row per language. The PrismaClient is injected so this is
 * testable against the test DB and reusable by the CLI entry point below.
 */
export async function seed(prisma: PrismaClient): Promise<void> {
  for (const language of LANGUAGES) {
    await prisma.language.upsert({
      where: { code: language.code },
      update: { name: language.name, supportedScripts: [...language.supportedScripts] },
      create: { ...language, supportedScripts: [...language.supportedScripts] },
    });
  }
}

/**
 * CLI entry point. Wires up a runtime PrismaClient (same schema-aware adapter
 * pattern as src/db/client.ts) and seeds the database pointed at by
 * DATABASE_URL. Runs only when this file is executed directly, e.g.
 * `npm -w backend run seed` — not when imported by tests.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const schema = parseSchemaFromUrl(connectionString);
  const adapter = new PrismaPg({ connectionString }, { schema });
  const prisma = new PrismaClient({ adapter });

  try {
    await seed(prisma);
    console.log(`Seeded ${LANGUAGES.length} languages.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
