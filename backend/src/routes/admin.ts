import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  addDictionaryEntries,
  runGenerate,
  runRegenerate,
} from "../services/admin.js";

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

/**
 * Admin routes (Task 3.5). Registered under `/v1` in `buildApp`, so the
 * effective paths are:
 *   POST /v1/admin/dictionary  — bulk-insert dictionary words (+clues)
 *   POST /v1/admin/generate    — fire-and-forget bulk level generation
 *   POST /v1/admin/regenerate  — retire active levels + create fresh ones
 *
 * These drive content via curl/Postman for now; the admin web panel is a later
 * milestone. They are enough to seed the dictionary and produce levels.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ADMIN-KEY GUARD (separate from the user-JWT `app.authenticate`)
 * ─────────────────────────────────────────────────────────────────────────
 * Every route here is guarded by a preHandler that compares the `x-admin-key`
 * header against the configured admin key (`app.adminKey`, injected via
 * buildApp, defaulting to `process.env.ADMIN_API_KEY`). A missing/wrong key →
 * 403.
 *
 * FAIL-CLOSED: if NO admin key is configured (env unset and none injected),
 * the guard rejects EVERYTHING with 403 — admin routes are never open. This is
 * deliberate: an unset key must not silently disable the guard. PRODUCTION MUST
 * SET `ADMIN_API_KEY` to use these routes at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ASYNC GENERATE/REGENERATE (documented)
 * ─────────────────────────────────────────────────────────────────────────
 * Generation is slow, so /generate and /regenerate are fire-and-forget: the
 * route kicks the service off WITHOUT awaiting and returns 202 + a jobId at
 * once. The jobId is an opaque correlation id (no real job queue in v1; no
 * status endpoint yet). A `.catch` logs background failures. Tests assert the
 * actual DB effect by calling the awaitable services directly — see admin.ts.
 */

/* ──────────────────────────────── Schemas ──────────────────────────────── */

const MAX_DICTIONARY_BATCH = 1000;

const clueSchema = z.object({
  type: z.enum(["text", "image"]),
  text: z.string().optional(),
  imageRef: z.string().optional(),
  personalityRef: z.string().optional(),
});

const wordSchema = z.object({
  word: z.string().min(1),
  frequency: z.number(),
  length: z.number().int().positive().optional(),
  clue: clueSchema.optional(),
});

// languageId OR languageCode must be present (refined below).
const languageRef = {
  languageId: z.string().min(1).optional(),
  languageCode: z.string().min(1).optional(),
};

const dictionarySchema = z
  .object({
    ...languageRef,
    script: z.enum(["lat", "cyr"]),
    words: z.array(wordSchema).min(1).max(MAX_DICTIONARY_BATCH),
  })
  .refine((b) => b.languageId !== undefined || b.languageCode !== undefined, {
    message: "languageId or languageCode is required",
  });

const generateSchema = z
  .object({
    ...languageRef,
    script: z.enum(["lat", "cyr"]),
    mode: z.enum(["basic", "advanced"]),
    levelCount: z.number().int().positive().max(10_000),
    variationsPerLevel: z.number().int().positive().max(100),
    seed: z.number().int(),
  })
  .refine((b) => b.languageId !== undefined || b.languageCode !== undefined, {
    message: "languageId or languageCode is required",
  });

/* ──────────────────────────────── Plugin ───────────────────────────────── */

export const adminRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Admin-key guard. Fail-closed: a falsy configured key rejects everything.
   * Constant-ish comparison is fine here (the key is a shared secret, not a
   * per-user credential); we keep it simple.
   */
  const requireAdminKey = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const configured = app.adminKey;
    const provided = request.headers["x-admin-key"];
    if (!configured || provided !== configured) {
      await reply.code(403).send({ error: "forbidden" });
    }
  };

  /** Resolves a languageId from an explicit id or a code; null if not found. */
  const resolveLanguageId = async (
    languageId: string | undefined,
    languageCode: string | undefined,
  ): Promise<string | null> => {
    if (languageId !== undefined) {
      const byId = await app.prisma.language.findUnique({
        where: { id: languageId },
        select: { id: true },
      });
      if (byId) return byId.id;
    }
    if (languageCode !== undefined) {
      const byCode = await app.prisma.language.findUnique({
        where: { code: languageCode },
        select: { id: true },
      });
      if (byCode) return byCode.id;
    }
    return null;
  };

  app.post(
    "/admin/dictionary",
    { preHandler: requireAdminKey },
    async (request, reply) => {
      const parsed = dictionarySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const { languageId, languageCode, script, words } = parsed.data;

      const resolvedId = await resolveLanguageId(languageId, languageCode);
      if (!resolvedId) {
        return reply.code(404).send({ error: "unknown language" });
      }

      const { created } = await addDictionaryEntries(app.prisma, {
        languageId: resolvedId,
        script,
        words,
      });
      return reply.send({ ok: true, created });
    },
  );

  app.post(
    "/admin/generate",
    { preHandler: requireAdminKey },
    async (request, reply) => {
      const parsed = generateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const { languageId, languageCode, ...rest } = parsed.data;

      const resolvedId = await resolveLanguageId(languageId, languageCode);
      if (!resolvedId) {
        return reply.code(404).send({ error: "unknown language" });
      }

      const jobId = randomUUID();
      // Fire-and-forget: do NOT await. Log background failures.
      void runGenerate(app.prisma, { ...rest, languageId: resolvedId }).catch(
        (err: unknown) => {
          app.log.error({ err, jobId }, "admin generate job failed");
        },
      );

      return reply.code(202).send({ ok: true, jobId });
    },
  );

  app.post(
    "/admin/regenerate",
    { preHandler: requireAdminKey },
    async (request, reply) => {
      const parsed = generateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const { languageId, languageCode, ...rest } = parsed.data;

      const resolvedId = await resolveLanguageId(languageId, languageCode);
      if (!resolvedId) {
        return reply.code(404).send({ error: "unknown language" });
      }

      const jobId = randomUUID();
      void runRegenerate(app.prisma, { ...rest, languageId: resolvedId }).catch(
        (err: unknown) => {
          app.log.error({ err, jobId }, "admin regenerate job failed");
        },
      );

      return reply.code(202).send({ ok: true, jobId });
    },
  );
};
