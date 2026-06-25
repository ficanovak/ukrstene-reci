import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');

/**
 * Vitest global setup. Runs once before the whole suite.
 *
 * It loads the test connection string from backend/.env.test and applies all
 * committed migrations to the TEST database with `prisma migrate deploy`. We
 * shell out to the Prisma CLI (rather than calling the engine directly) so the
 * test DB schema is produced by the exact same migration files that ship to
 * production. The DATABASE_URL is injected into the child process env so it
 * wins over prisma.config.ts's dotenv-loaded `.env` (the dev DB).
 */
export default function setup(): void {
  const { parsed, error } = loadEnv({ path: resolve(backendRoot, '.env.test') });
  if (error) {
    throw new Error(`Could not load backend/.env.test: ${error.message}`);
  }
  const databaseUrl = parsed?.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set in backend/.env.test');
  }

  // Expose it to the test process too, so the test PrismaClient binds to the
  // test DB (see test/prisma.ts).
  process.env.DATABASE_URL = databaseUrl;

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
