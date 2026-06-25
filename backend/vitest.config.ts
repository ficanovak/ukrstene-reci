import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

// Integration tests run against the dedicated test database. Load its
// connection string before anything imports the test PrismaClient. The global
// setup (test/globalSetup.ts) also loads it and applies migrations once before
// the suite runs.
loadEnv({ path: ".env.test" });

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    // Integration tests share ONE Postgres test database. Running test FILES in
    // parallel lets their writes/truncates interleave and clobber each other
    // (e.g. one file's TRUNCATE wiping rows another is mid-assertion on). Pure
    // unit tests are unaffected by serial files. So we disable file-level
    // parallelism for a deterministic, race-free suite; tests WITHIN a file
    // still run in their defined order.
    fileParallelism: false,
  },
});
