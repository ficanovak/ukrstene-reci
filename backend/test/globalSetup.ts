import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '..');

/**
 * Vitest global setup. Runs once before the whole suite.
 *
 * It resolves the test connection string and applies all committed migrations
 * to the TEST database with `prisma migrate deploy`. We shell out to the Prisma
 * CLI (rather than calling the engine directly) so the test DB schema is
 * produced by the exact same migration files that ship to production.
 *
 * DATABASE_URL resolution (CI-safe):
 *   1. If DATABASE_URL is already set in the environment (e.g. CI exports it,
 *      pointing at the Postgres service container), it wins and `.env.test` is
 *      not required. dotenv never overrides an already-set var by default, but
 *      we make this explicit and skip the "file is mandatory" check.
 *   2. Otherwise (local dev) we load it from backend/.env.test.
 * The resolved URL is injected into the child process env so it wins over
 * prisma.config.ts's dotenv-loaded `.env` (the dev DB).
 */
export default function setup(): void {
  // Local dev: load .env.test. In CI there is no such file and DATABASE_URL is
  // provided by the workflow env, so a missing file is not an error there.
  // dotenv does not override an existing process.env.DATABASE_URL.
  loadEnv({ path: resolve(backendRoot, '.env.test') });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Provide it via backend/.env.test (local) or the environment (CI).',
    );
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: backendRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
