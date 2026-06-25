import fastifyJwt from "@fastify/jwt";
import Fastify from "fastify";

import { prisma as runtimePrisma } from "./db/client.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { levelsRoutes } from "./routes/levels.js";
import { progressRoutes } from "./routes/progress.js";
import { defaultSocialVerifier } from "./services/socialVerify.js";

import type { SocialVerifier } from "./services/socialVerify.js";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

/**
 * Dev/test fallback JWT secret. Used only when `JWT_SECRET` is not set in the
 * environment so local development and tests work with zero config.
 *
 * PRODUCTION MUST SET `JWT_SECRET` — a real, high-entropy value. This fallback
 * is intentionally obvious and is never a safe secret to ship.
 */
const DEV_JWT_SECRET = "dev-insecure-jwt-secret-change-me";

/**
 * Dependencies the app factory accepts. All are optional and default to the
 * real runtime collaborators, so production code calls `buildApp()` with no
 * args. Tests inject the TEST PrismaClient and a MOCK social verifier so HTTP
 * integration tests hit the test DB and never make real Apple/Google calls.
 */
export interface BuildAppOptions {
  prisma?: PrismaClient;
  socialVerifier?: SocialVerifier;
  /**
   * Shared secret guarding the admin routes (`/v1/admin/*`), compared against
   * the `x-admin-key` header. Defaults to `process.env.ADMIN_API_KEY`. Tests
   * inject a known key. FAIL-CLOSED: when unset (undefined/empty), the admin
   * guard rejects EVERY request with 403 — the routes are never open.
   * PRODUCTION MUST SET `ADMIN_API_KEY` to use the admin routes.
   */
  adminKey?: string;
}

// Make the injected collaborators and the auth decorator visible on the Fastify
// instance type, so route modules can use `app.prisma`, `app.socialVerifier`
// and `app.authenticate` with full typing.
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    socialVerifier: SocialVerifier;
    /**
     * Shared admin secret for the `/v1/admin/*` guard. `undefined` when no key
     * is configured, in which case the guard fails closed (403 for all). See
     * {@link BuildAppOptions.adminKey}.
     */
    adminKey: string | undefined;
    /**
     * preHandler that verifies the request's JWT (via `request.jwtVerify()`),
     * replying 401 on failure. Reusable by protected routes in tasks 3.3/3.4:
     *   app.get("/secret", { preHandler: app.authenticate }, handler)
     * On success `request.user` carries the JWT payload (e.g. `{ sub }`).
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Application factory.
 *
 * Builds and returns a fully configured Fastify instance with all plugins and
 * routes registered, but WITHOUT calling `.listen()`. This separation lets
 * tests drive the app via `app.inject(...)` (no port, no real network) while
 * `server.ts` is the only place that binds a port.
 *
 * Conventions for later route modules (levels 3.3, progress 3.4, admin 3.5):
 *   - Each feature is a `FastifyPluginAsync` exported from `src/routes/*.ts`.
 *   - It is registered here under the `/v1` prefix (API versioning). A route
 *     declaring `app.get("/foo")` is therefore served at `GET /v1/foo`.
 *   - `@fastify/jwt` is registered below, so auth routes can use
 *     `app.jwt.sign(...)` and the `request.jwtVerify()` decorator.
 *   - Protected routes attach `app.authenticate` as a preHandler.
 *   - The PrismaClient and social verifier are read off the instance
 *     (`app.prisma`, `app.socialVerifier`) so tests can inject test doubles.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    // Pino logger. Quiet during tests to keep output readable; sensible
    // defaults otherwise. (JSON body parsing is built into Fastify.)
    logger: process.env.NODE_ENV === "test" ? false : true,
  });

  // Injected collaborators default to the real runtime ones, so `buildApp()`
  // with no args is production-correct; tests pass the test DB + mock verifier.
  app.decorate("prisma", options.prisma ?? runtimePrisma);
  app.decorate("socialVerifier", options.socialVerifier ?? defaultSocialVerifier);
  // Admin guard secret. Defaults to the env var so production is config-driven;
  // tests inject a known key. Empty string is normalized to undefined so the
  // guard fails closed rather than matching an empty header.
  app.decorate("adminKey", options.adminKey ?? process.env.ADMIN_API_KEY ?? undefined);

  // JWT support. Auth routes sign tokens with `app.jwt.sign`; protected routes
  // verify them via the `authenticate` decorator below.
  //
  // FAIL-CLOSED in production: the `DEV_JWT_SECRET` fallback exists only so dev
  // (NODE_ENV unset) and tests (NODE_ENV='test') work with zero config. If we
  // booted production with that public, hardcoded secret, ANYONE could forge a
  // JWT for any `sub` and impersonate any user. So when NODE_ENV==='production'
  // we REQUIRE a real, distinct JWT_SECRET — an unset or dev-equal value throws
  // here at startup (fail loud) rather than silently shipping a known secret.
  const jwtSecret = process.env.JWT_SECRET ?? DEV_JWT_SECRET;
  if (process.env.NODE_ENV === "production" && jwtSecret === DEV_JWT_SECRET) {
    throw new Error(
      "JWT_SECRET must be set to a real, high-entropy value in production " +
        "(the insecure dev fallback is not allowed). Refusing to start.",
    );
  }
  app.register(fastifyJwt, {
    secret: jwtSecret,
  });

  // Reusable auth guard for protected routes (tasks 3.3/3.4). `jwtVerify()` is
  // added by @fastify/jwt; on failure it throws, which we turn into a 401.
  app.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
      try {
        await request.jwtVerify();
      } catch {
        await reply.code(401).send({ error: "unauthorized" });
      }
    },
  );

  // Generic error handler. Routes already send explicit 4xx replies (zod 400s,
  // 401/403/404) by returning a reply, so those never reach here. What DOES
  // reach here is an unexpected throw (a true 5xx) or a Fastify-internal error
  // (e.g. schema validation, which carries a 4xx `statusCode`). We always log
  // the full error server-side, then:
  //   - pass 4xx errors through with their statusCode + message (these are
  //     client-facing and safe; this preserves validation/auth semantics);
  //   - mask everything else as a generic 500 `{ error: 'internal' }` WITHOUT
  //     echoing `err.message`, so internal details never leak to clients.
  app.setErrorHandler((err: FastifyError, request, reply) => {
    request.log.error(err);
    const status = err.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: err.message });
    }
    return reply.code(500).send({ error: "internal" });
  });

  // API versioning: all feature routes mount under `/v1`.
  app.register(healthRoutes, { prefix: "/v1" });
  app.register(authRoutes, { prefix: "/v1" });
  app.register(levelsRoutes, { prefix: "/v1" });
  app.register(progressRoutes, { prefix: "/v1" });
  app.register(adminRoutes, { prefix: "/v1" });

  // TODO: add CORS / helmet / rate-limiting when a real client integrates and
  // the threat model is clearer (YAGNI for the skeleton).

  return app;
}
