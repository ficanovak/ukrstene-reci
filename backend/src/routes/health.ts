import type { FastifyPluginAsync } from "fastify";

/**
 * Health route plugin.
 *
 * Registered under the `/v1` prefix in `buildApp`, so the effective path is
 * `GET /v1/health`. It performs no I/O (no database) and exists for liveness
 * probes and as a smoke-test endpoint.
 *
 * This is the canonical route-module shape for the API: each feature exports a
 * `FastifyPluginAsync` and is registered in `app.ts` under `/v1`. Auth (3.2),
 * levels (3.3), progress (3.4) and admin (3.5) follow this same pattern.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    return { status: "ok" };
  });
};
