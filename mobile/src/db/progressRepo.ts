/**
 * Local-progress repository (Task 4.3): record completed-level results and
 * manage the sync queue (Task 4.4: getUnsynced → POST batch → markSynced).
 *
 * Takes a {@link SqliteDb} so production uses the real expo-sqlite handle and
 * tests use a better-sqlite3 adapter against the SAME SQL (see sqlite.ts).
 *
 * BEST-RESULT POLICY (mirrors the server, backend progress.ts): a re-completion
 * of the same (level_id, mode) keeps the BEST result — higher `stars` wins, a
 * tie on stars breaks by higher `score`; a worse/equal replay is a no-op. The
 * row is UNIQUE on (level_id, mode), so this is an upsert, not a duplicate. Any
 * change to the stored result resets `synced = 0` so the improvement re-syncs;
 * a no-op replay leaves `synced` untouched (so an already-synced best result
 * isn't needlessly re-queued).
 */

import type { SqliteDb } from "./sqlite";

/** A completed-level result to record locally (camelCase, app-facing). */
export interface ProgressResult {
  levelId: string;
  mode: string;
  stars: number;
  score: number;
  mistakes: number;
  hintsUsed: number;
}

/** Raw row shape in `local_progress` (snake_case columns). */
interface LocalProgressDbRow {
  id: number;
  level_id: string;
  mode: string;
  stars: number;
  score: number;
  mistakes: number;
  hints_used: number;
  completed_at: string;
  synced: number;
}

/** App-facing `local_progress` row (camelCase), e.g. for the sync batch. */
export interface LocalProgressRow {
  id: number;
  levelId: string;
  mode: string;
  stars: number;
  score: number;
  mistakes: number;
  hintsUsed: number;
  completedAt: string;
  synced: number;
}

function toRow(r: LocalProgressDbRow): LocalProgressRow {
  return {
    id: r.id,
    levelId: r.level_id,
    mode: r.mode,
    stars: r.stars,
    score: r.score,
    mistakes: r.mistakes,
    hintsUsed: r.hints_used,
    completedAt: r.completed_at,
    synced: r.synced,
  };
}

/** True if `incoming` is strictly better than `existing` (stars, then score). */
function isBetter(
  incoming: Pick<ProgressResult, "stars" | "score">,
  existing: Pick<LocalProgressDbRow, "stars" | "score">,
): boolean {
  if (incoming.stars !== existing.stars) return incoming.stars > existing.stars;
  return incoming.score > existing.score;
}

/**
 * Upsert a completed-level result under the best-result policy (see module
 * doc). On a strictly-better result (or first completion) the row is written
 * with `synced = 0`; an equal/worse replay is a no-op leaving the row (and its
 * synced flag) untouched.
 */
export async function saveProgress(db: SqliteDb, result: ProgressResult): Promise<void> {
  const existing = await db.getFirstAsync<LocalProgressDbRow>(
    "SELECT * FROM local_progress WHERE level_id = ? AND mode = ?",
    [result.levelId, result.mode],
  );

  if (existing && !isBetter(result, existing)) {
    // Idempotent no-op: don't downgrade, don't reset synced.
    return;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO local_progress
       (level_id, mode, stars, score, mistakes, hints_used, completed_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(level_id, mode) DO UPDATE SET
       stars = excluded.stars,
       score = excluded.score,
       mistakes = excluded.mistakes,
       hints_used = excluded.hints_used,
       completed_at = excluded.completed_at,
       synced = 0`,
    [
      result.levelId,
      result.mode,
      result.stars,
      result.score,
      result.mistakes,
      result.hintsUsed,
      now,
    ],
  );
}

/** All locally-recorded results not yet synced to the server (oldest first). */
export async function getUnsynced(db: SqliteDb): Promise<LocalProgressRow[]> {
  const rows = await db.getAllAsync<LocalProgressDbRow>(
    "SELECT * FROM local_progress WHERE synced = 0 ORDER BY id ASC",
    [],
  );
  return rows.map(toRow);
}

/** Mark the given local_progress rows as synced. Empty list is a no-op. */
export async function markSynced(db: SqliteDb, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  await db.runAsync(
    `UPDATE local_progress SET synced = 1 WHERE id IN (${placeholders})`,
    ids,
  );
}
