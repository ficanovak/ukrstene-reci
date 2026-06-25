import { z } from "zod";

import { UnknownLevelError, upsertProgress, upsertProgressBatch } from "../services/progress.js";

// Side-effect import: registers the @fastify/jwt declaration merge that types
// `request.user` as AuthPayload (so no `as AuthPayload` cast is needed below).
import "../types/auth.js";

import type { FastifyPluginAsync } from "fastify";

/**
 * Progress routes (Task 3.4). Registered under `/v1` in `buildApp`, so the
 * effective paths are `POST /v1/progress` and `POST /v1/progress/batch`.
 *
 * Both are protected by `app.authenticate` (JWT required → 401 otherwise); the
 * userId is read from `request.user.sub` (typed via {@link AuthPayload}) and is
 * the source of truth — the client never sends a userId. HTTP concerns live
 * here (body validation, status codes); the upsert/best-result logic lives in
 * src/services/progress.ts.
 *
 * POLICY (see the service for the full rationale):
 *  - stars 1–5 (a completed level always earns ≥1 star; 0 is "unrated").
 *  - score / mistakes / hintsUsed are non-negative ints.
 *  - UPSERT on the unique (userId, levelId, mode), keeping the BEST result
 *    (higher stars; score breaks a stars tie) so offline replays of an older or
 *    worse result are idempotent and never downgrade.
 *  - Batch is capped at 200 items and applied ATOMICALLY in one transaction.
 *    A single invalid item fails zod validation → 400 and nothing is written.
 */

const MAX_BATCH = 200;

const resultSchema = z.object({
  levelId: z.string().min(1),
  mode: z.enum(["basic", "advanced"]),
  // 1–5: a submitted row is a COMPLETED level, which always earns ≥1 star.
  stars: z.number().int().min(1).max(5),
  score: z.number().int().min(0),
  mistakes: z.number().int().min(0),
  hintsUsed: z.number().int().min(0),
});

const batchSchema = z.object({
  items: z.array(resultSchema).min(1).max(MAX_BATCH),
});

export const progressRoutes: FastifyPluginAsync = async (app) => {
  app.post("/progress", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = resultSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }

    const userId = request.user.sub;
    try {
      const progress = await upsertProgress(app.prisma, { userId, ...parsed.data });
      return reply.send({ ok: true, progress });
    } catch (err) {
      if (err instanceof UnknownLevelError) {
        // Stale/unknown levelId from an offline client: clean 404, not a 500.
        return reply.code(404).send({ error: `unknown levelId: ${err.missing.join(", ")}` });
      }
      throw err;
    }
  });

  app.post("/progress/batch", { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = batchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }

    const userId = request.user.sub;
    const inputs = parsed.data.items.map((item) => ({ userId, ...item }));
    try {
      const results = await upsertProgressBatch(app.prisma, inputs);
      return reply.send({ ok: true, count: results.length });
    } catch (err) {
      if (err instanceof UnknownLevelError) {
        // Any unknown levelId aborts the whole (atomic) batch: nothing written.
        return reply.code(404).send({ error: `unknown levelId: ${err.missing.join(", ")}` });
      }
      throw err;
    }
  });
};
