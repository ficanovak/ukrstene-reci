import { z } from "zod";

import { getNextLevels } from "../services/levels.js";

import type { AuthPayload } from "../types/auth.js";
import type { FastifyPluginAsync } from "fastify";

/**
 * Levels routes (Task 3.3). Registered under `/v1` in `buildApp`, so the
 * effective path is `GET /v1/levels/next`.
 *
 * Protected by `app.authenticate` (JWT required → 401 otherwise); the userId is
 * read from `request.user.sub`. HTTP concerns live here (query validation, lang
 * resolution, status codes); the query logic lives in src/services/levels.ts.
 *
 * Query: ?mode=basic&lang=sr&script=lat&count=10
 *   - mode:   'basic' | 'advanced'
 *   - lang:   language CODE (sr/hr/bs/me/mk), resolved to languageId here. An
 *             unknown code is a 404 (the request was well-formed, the resource
 *             does not exist).
 *   - script: 'lat' | 'cyr'
 *   - count:  optional, defaults to 10, clamped to [1, 50].
 * Bad input → 400. See the service for progression semantics (completed-by-
 * number, one-stable-variation-per-number).
 */

const DEFAULT_COUNT = 10;
const MAX_COUNT = 50;

const querySchema = z.object({
  mode: z.enum(["basic", "advanced"]),
  lang: z.string().min(1),
  script: z.enum(["lat", "cyr"]),
  // Query strings arrive as strings; coerce + clamp. Optional → default.
  count: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_COUNT)
    .catch(MAX_COUNT)
    .optional(),
});

export const levelsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/levels/next",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid query" });
      }
      const { mode, lang, script } = parsed.data;
      const count = parsed.data.count ?? DEFAULT_COUNT;

      const language = await app.prisma.language.findUnique({
        where: { code: lang },
        select: { id: true },
      });
      if (!language) {
        return reply.code(404).send({ error: "unknown language" });
      }

      const userId = (request.user as AuthPayload).sub;
      const levels = await getNextLevels(app.prisma, {
        userId,
        languageId: language.id,
        mode,
        script,
        count,
      });

      return reply.send({ levels });
    },
  );
};
