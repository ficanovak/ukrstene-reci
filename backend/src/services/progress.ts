import type { Mode, PrismaClient, Prisma, UserProgress } from "@prisma/client";

/**
 * Progress submission business logic (Task 3.4): record a completed level's
 * result, keyed on the unique (userId, levelId, mode).
 *
 * Pure-ish, framework-agnostic: takes an injected PrismaClient (so tests hit the
 * test DB). The Fastify route layer (src/routes/progress.ts) handles HTTP
 * concerns (body validation, auth, status codes) and calls here.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * POLICY (deliberate decisions, documented per the task brief)
 * ───────────────────────────────────────────────────────────────────────────
 * stars range: 1–5
 *   A submitted row represents a COMPLETED level, which always earns at least
 *   one star. 0 is reserved for "not yet rated" and is never submitted, so the
 *   route validates stars ∈ [1, 5] (0 → 400). Validation lives at the route.
 *
 * idempotency + BEST-RESULT on conflict (NOT last-write-wins)
 *   Offline clients (mobile Task 4.4) retry/replay queued results, so the same
 *   (userId, levelId, mode) may be submitted repeatedly — possibly an OLDER,
 *   WORSE result after a better one already synced. We must never downgrade.
 *   On conflict we keep the BEST result: higher `stars` wins; a tie on stars is
 *   broken by higher `score`. If the incoming result is not strictly better, the
 *   stored row is left untouched (a no-op upsert) — so a replay is idempotent and
 *   never duplicates or downgrades. This mirrors the auth migration conflict rule
 *   (keep the user's best progress on link).
 *
 *   We implement this read-then-conditionally-write rather than a blind upsert so
 *   we can compare against the existing row. To stay race-safe under concurrent
 *   submits for the SAME key, callers run it inside a transaction (the route does
 *   for the single submit; the batch wraps the whole array in one $transaction).
 */

export interface ProgressInput {
  userId: string;
  levelId: string;
  mode: Mode;
  stars: number;
  score: number;
  mistakes: number;
  hintsUsed: number;
}

/** True if `incoming` is strictly better than `existing` (stars, then score). */
function isBetter(
  incoming: Pick<ProgressInput, "stars" | "score">,
  existing: Pick<UserProgress, "stars" | "score">,
): boolean {
  if (incoming.stars !== existing.stars) return incoming.stars > existing.stars;
  return incoming.score > existing.score;
}

/**
 * Upsert a single progress result under the BEST-RESULT policy. Returns the
 * resulting (possibly unchanged) row. Accepts a `Prisma.TransactionClient` or a
 * full `PrismaClient`, so it composes inside the batch transaction.
 */
export async function upsertProgress(
  db: PrismaClient | Prisma.TransactionClient,
  input: ProgressInput,
): Promise<UserProgress> {
  const { userId, levelId, mode } = input;

  const existing = await db.userProgress.findUnique({
    where: { userId_levelId_mode: { userId, levelId, mode } },
  });

  if (existing && !isBetter(input, existing)) {
    // Replay of an equal/worse result: keep what we have (idempotent no-op).
    return existing;
  }

  return db.userProgress.upsert({
    where: { userId_levelId_mode: { userId, levelId, mode } },
    create: {
      userId,
      levelId,
      mode,
      stars: input.stars,
      score: input.score,
      mistakes: input.mistakes,
      hintsUsed: input.hintsUsed,
    },
    update: {
      stars: input.stars,
      score: input.score,
      mistakes: input.mistakes,
      hintsUsed: input.hintsUsed,
      completedAt: new Date(),
    },
  });
}

/**
 * Upsert a batch of results ATOMICALLY in one transaction: either every item is
 * applied (each under the best-result policy) or none is. Atomicity keeps the
 * offline-flush all-or-nothing, so a partially-applied batch can't leave the
 * client's queue in an ambiguous state. Returns the resulting rows.
 */
export async function upsertProgressBatch(
  prisma: PrismaClient,
  inputs: ProgressInput[],
): Promise<UserProgress[]> {
  return prisma.$transaction(async (tx) => {
    const results: UserProgress[] = [];
    for (const input of inputs) {
      results.push(await upsertProgress(tx, input));
    }
    return results;
  });
}
