import { createHash } from "node:crypto";

import type { Level, Mode, PrismaClient } from "@prisma/client";

/**
 * Levels business logic (Task 3.3): serve the next batch of levels a user has
 * NOT completed, in progression order, for a given mode/language/script.
 *
 * Pure-ish, framework-agnostic: takes an injected PrismaClient + params (so
 * tests hit the test DB). The Fastify route layer (src/routes/levels.ts)
 * handles HTTP concerns (query validation, auth, status codes) and calls here.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * PROGRESSION SEMANTICS (deliberate decisions, documented per the task brief)
 * ───────────────────────────────────────────────────────────────────────────
 * lang resolution
 *   The route accepts a language CODE (sr/hr/bs/me/mk) — friendlier for clients
 *   than an opaque cuid. The route resolves it to a languageId before calling
 *   {@link getNextLevels}; an unknown code is a 404 (decided at the route).
 *   This function takes the already-resolved `languageId`.
 *
 * "completed" is by level NUMBER, not by level id
 *   A level NUMBER can have several variations (different `variationGroup`,
 *   different rows/ids). Progression is by NUMBER: once a user has completed ANY
 *   variation of level number N (i.e. there is a UserProgress row for that user,
 *   for SOME level with `levelNumber === N` and the SAME mode), we never serve
 *   level number N again — the player should not replay the "same" puzzle under
 *   a different variation. Completed numbers are computed by joining the user's
 *   UserProgress rows back to Level.levelNumber (scoped to this mode).
 *   NOTE: completion is mode-specific (UserProgress carries `mode`), so finishing
 *   a number in `basic` does NOT hide it in `advanced`.
 *
 * one variation per level number, STABLE per user
 *   Among the active, uncompleted candidates, a single level number may still
 *   have multiple variation rows. We return exactly ONE per number. The choice
 *   is deterministic per (userId, levelNumber): the candidate variations for a
 *   number are sorted by id (stable, total order) and we pick index
 *   `hash(userId + ":" + levelNumber) % variations.length`, where `hash` is a
 *   sha256 of the string reduced to a 32-bit unsigned int. Because the hash only
 *   depends on userId + levelNumber (not on call time or on which OTHER numbers
 *   are present), the same user always gets the same variation for a given
 *   number across repeated calls — while different users spread across the
 *   available variations.
 */

/** The playable payload the client needs to render + play a level. */
export interface PlayableLevel {
  id: string;
  mode: Mode;
  languageId: string;
  script: string;
  levelNumber: number;
  difficultyBand: number;
  gridWidth: number;
  gridHeight: number;
  gridData: unknown;
}

export interface GetNextLevelsParams {
  userId: string;
  languageId: string;
  mode: Mode;
  script: string;
  count: number;
}

/** Stable 32-bit unsigned hash of a string (sha256-derived). */
function stableHash(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  // First 4 bytes as an unsigned big-endian int.
  return digest.readUInt32BE(0);
}

function toPlayable(level: Level): PlayableLevel {
  return {
    id: level.id,
    mode: level.mode,
    languageId: level.languageId,
    script: level.script,
    levelNumber: level.levelNumber,
    difficultyBand: level.difficultyBand,
    gridWidth: level.gridWidth,
    gridHeight: level.gridHeight,
    gridData: level.gridData,
  };
}

/**
 * Return up to `count` playable levels for the user, ascending by levelNumber,
 * one (stably-chosen) variation per number, excluding numbers the user has
 * already completed in this mode. See the module doc for the full semantics.
 */
export async function getNextLevels(
  prisma: PrismaClient,
  params: GetNextLevelsParams,
): Promise<PlayableLevel[]> {
  const { userId, languageId, mode, script, count } = params;

  if (count <= 0) return [];

  // Level numbers this user has already completed in this mode (by NUMBER).
  // Join their UserProgress rows back to Level.levelNumber.
  const completed = await prisma.userProgress.findMany({
    where: { userId, mode, level: { languageId, script, mode } },
    select: { level: { select: { levelNumber: true } } },
  });
  const completedNumbers = new Set(completed.map((p) => p.level.levelNumber));

  // Candidate active levels for this mode/lang/script, ordered so that grouping
  // by levelNumber and picking variations is deterministic. Order by
  // (levelNumber asc, id asc): id asc gives the stable per-number variation
  // order the selector indexes into.
  const candidates = await prisma.level.findMany({
    where: { languageId, script, mode, status: "active" },
    orderBy: [{ levelNumber: "asc" }, { id: "asc" }],
  });

  // Group candidates by levelNumber, skipping completed numbers, preserving the
  // ascending levelNumber order via insertion order of the Map.
  const byNumber = new Map<number, Level[]>();
  for (const level of candidates) {
    if (completedNumbers.has(level.levelNumber)) continue;
    const bucket = byNumber.get(level.levelNumber);
    if (bucket) bucket.push(level);
    else byNumber.set(level.levelNumber, [level]);
  }

  const result: PlayableLevel[] = [];
  for (const [levelNumber, variations] of byNumber) {
    if (result.length >= count) break;
    // Deterministic, stable-per-(user,number) variation pick. `variations` is
    // already sorted by id asc from the query orderBy.
    const idx = stableHash(`${userId}:${levelNumber}`) % variations.length;
    result.push(toPlayable(variations[idx]));
  }

  return result;
}
