import fastifyJwt from "@fastify/jwt";
import Fastify from "fastify";

import { healthRoutes } from "./routes/health.js";

import type { FastifyInstance } from "fastify";

/**
 * Dev/test fallback JWT secret. Used only when `JWT_SECRET` is not set in the
 * environment so local development and tests work with zero config.
 *
 * PRODUCTION MUST SET `JWT_SECRET` — a real, high-entropy value. This fallback
 * is intentionally obvious and is never a safe secret to ship.
 */
const DEV_JWT_SECRET = "dev-insecure-jwt-secret-change-me";

/**
 * Application factory.
 *
 * Builds and returns a fully configured Fastify instance with all plugins and
 * routes registered, but WITHOUT calling `.listen()`. This separation lets
 * tests drive the app via `app.inject(...)` (no port, no real network) while
 * `server.ts` is the only place that binds a port.
 *
 * Conventions for later route modules (auth 3.2, levels 3.3, progress 3.4,
 * admin 3.5):
 *   - Each feature is a `FastifyPluginAsync` exported from `src/routes/*.ts`.
 *   - It is registered here under the `/v1` prefix (API versioning). A route
 *     declaring `app.get("/foo")` is therefore served at `GET /v1/foo`.
 *   - `@fastify/jwt` is already registered below, so auth routes can use
 *     `app.jwt.sign(...)` and the `request.jwtVerify()` decorator without
 *     re-registering it.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    // Pino logger. Quiet during tests to keep output readable; sensible
    // defaults otherwise. (JSON body parsing is built into Fastify.)
    logger: process.env.NODE_ENV === "test" ? false : true,
  });

  // JWT support is registered now (in 3.1) so the app factory stays stable as
  // auth (3.2) lands. The actual login/protected routes come later.
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  });

  // API versioning: all feature routes mount under `/v1`.
  app.register(healthRoutes, { prefix: "/v1" });

  // TODO: add CORS / helmet / rate-limiting when a real client integrates and
  // the threat model is clearer (YAGNI for the skeleton).

  return app;
}
