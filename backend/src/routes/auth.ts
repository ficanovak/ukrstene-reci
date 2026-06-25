import { z } from "zod";

import { InvalidSocialTokenError, anonLogin, socialLogin } from "../services/auth.js";

import type { FastifyPluginAsync } from "fastify";

/**
 * Auth routes (Task 3.2): anonymous + social login, both returning a signed
 * JWT, plus anonymous→social progress migration at link time.
 *
 * Registered under `/v1` in `buildApp`, so the effective paths are
 * `POST /v1/auth/anon` and `POST /v1/auth/social`.
 *
 * HTTP concerns live here (body validation, JWT signing, status codes); the
 * business logic lives in src/services/auth.ts and is unit/integration-tested
 * with an injected prisma client + mock social verifier. This plugin reads the
 * prisma client and social verifier off the Fastify instance (decorated in
 * buildApp), which is what makes tests able to inject the test DB + a mock.
 */

const anonSchema = z.object({
  deviceId: z.string().min(1),
});

const socialSchema = z.object({
  provider: z.enum(["apple", "google"]),
  token: z.string().min(1),
  anonUserId: z.string().min(1).optional(),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/anon", async (request, reply) => {
    const parsed = anonSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }

    const user = await anonLogin(app.prisma, parsed.data.deviceId);
    const token = app.jwt.sign({ sub: user.id });
    return reply.send({ token, userId: user.id });
  });

  app.post("/auth/social", async (request, reply) => {
    const parsed = socialSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }

    let user;
    try {
      user = await socialLogin(app.prisma, app.socialVerifier, parsed.data);
    } catch (err) {
      if (err instanceof InvalidSocialTokenError) {
        return reply.code(401).send({ error: "invalid social token" });
      }
      throw err;
    }

    const token = app.jwt.sign({ sub: user.id });
    return reply.send({ token, userId: user.id });
  });
};
