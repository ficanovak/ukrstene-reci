import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads the connection URL from schema.prisma; the CLI
// (validate, generate, migrate) reads it from here. `dotenv/config` loads
// DATABASE_URL from backend/.env. The `?schema=ukrstene` in that URL keeps
// this app's tables isolated in their own Postgres schema.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
