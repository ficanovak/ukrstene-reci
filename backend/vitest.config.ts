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
  },
});
