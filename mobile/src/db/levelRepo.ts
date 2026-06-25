/**
 * Cached-levels repository (Task 4.3): write the local cache of playable levels
 * fetched from the server, and read back the next level to play / cache stats.
 *
 * All functions take a {@link SqliteDb} (the thin async interface) so production
 * passes the real expo-sqlite handle and tests pass a better-sqlite3 adapter —
 * both exercise the SAME SQL. See sqlite.ts for why.
 *
 * `gridData` is stored as a JSON TEXT string (`grid_data`) and parsed back on
 * read. We type it as `unknown` for now; the canonical `GridData` type lives in
 * the backend and will move to a shared workspace package (future task, per the
 * 2.6 plan) — at which point this can import it.
 */

import type { SqliteDb } from "./sqlite";

/**
 * A playable level as returned by `GET /v1/levels/next` (backend
 * `PlayableLevel`). The unit cached locally; one variation per level number.
 */
export interface PlayableLevel {
  id: string;
  mode: string;
  languageId: string;
  script: string;
  levelNumber: number;
  difficultyBand: number;
  gridWidth: number;
  gridHeight: number;
  /** The crossword payload (backend `GridData`); stored as JSON TEXT. */
  gridData: unknown;
}

/** Raw row shape in `cached_levels` (snake_case columns, grid_data as TEXT). */
export interface CachedLevelRow {
  id: string;
  mode: string;
  language_id: string;
  script: string;
  level_number: number;
  difficulty_band: number;
  grid_width: number;
  grid_height: number;
  grid_data: string;
  cached_at: string;
}

/** Scope a progression query to one mode/language/script (matches the server). */
export interface LevelScope {
  mode: string;
  languageId: string;
  script: string;
}

/** Map a DB row back to a {@link PlayableLevel}, parsing grid_data JSON. */
function rowToPlayable(row: CachedLevelRow): PlayableLevel {
  return {
    id: row.id,
    mode: row.mode,
    languageId: row.language_id,
    script: row.script,
    levelNumber: row.level_number,
    difficultyBand: row.difficulty_band,
    gridWidth: row.grid_width,
    gridHeight: row.grid_height,
    gridData: JSON.parse(row.grid_data),
  };
}

/**
 * Cache (upsert) a pack of levels. Re-caching an existing id REPLACES its row
 * (the server is the source of truth for level content), keyed on the PK `id`.
 * `cached_at` is refreshed on every write.
 */
export async function cacheLevels(db: SqliteDb, levels: PlayableLevel[]): Promise<void> {
  const now = new Date().toISOString();
  for (const lvl of levels) {
    await db.runAsync(
      `INSERT INTO cached_levels
         (id, mode, language_id, script, level_number, difficulty_band,
          grid_width, grid_height, grid_data, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         mode = excluded.mode,
         language_id = excluded.language_id,
         script = excluded.script,
         level_number = excluded.level_number,
         difficulty_band = excluded.difficulty_band,
         grid_width = excluded.grid_width,
         grid_height = excluded.grid_height,
         grid_data = excluded.grid_data,
         cached_at = excluded.cached_at`,
      [
        lvl.id,
        lvl.mode,
        lvl.languageId,
        lvl.script,
        lvl.levelNumber,
        lvl.difficultyBand,
        lvl.gridWidth,
        lvl.gridHeight,
        JSON.stringify(lvl.gridData),
        now,
      ],
    );
  }
}

/** Fetch a cached level by its server id, or null if not cached. */
export async function getLevelById(db: SqliteDb, id: string): Promise<PlayableLevel | null> {
  const row = await db.getFirstAsync<CachedLevelRow>(
    "SELECT * FROM cached_levels WHERE id = ?",
    [id],
  );
  return row ? rowToPlayable(row) : null;
}

/**
 * The next level to play: the lowest `level_number` cached level for this
 * mode/language/script that has NO `local_progress` row (i.e. uncompleted), or
 * null if none remain. Mirrors the server's "ascending by levelNumber, skip
 * completed" progression — completion is keyed on the cached level's id, which
 * is equivalent to by-number given one cached variation per number (see
 * schema.ts). Ties on level_number break by id for determinism.
 */
export async function getNextLevel(db: SqliteDb, scope: LevelScope): Promise<PlayableLevel | null> {
  const row = await db.getFirstAsync<CachedLevelRow>(
    `SELECT c.* FROM cached_levels c
       WHERE c.mode = ? AND c.language_id = ? AND c.script = ?
         AND NOT EXISTS (
           SELECT 1 FROM local_progress p
            WHERE p.level_id = c.id AND p.mode = c.mode
         )
       ORDER BY c.level_number ASC, c.id ASC
       LIMIT 1`,
    [scope.mode, scope.languageId, scope.script],
  );
  return row ? rowToPlayable(row) : null;
}

/**
 * How many cached levels for this scope are still uncompleted. Feeds the sync
 * prefetch trigger (Task 4.4): when this runs low, fetch more from the server.
 */
export async function countCachedUncompleted(db: SqliteDb, scope: LevelScope): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM cached_levels c
       WHERE c.mode = ? AND c.language_id = ? AND c.script = ?
         AND NOT EXISTS (
           SELECT 1 FROM local_progress p
            WHERE p.level_id = c.id AND p.mode = c.mode
         )`,
    [scope.mode, scope.languageId, scope.script],
  );
  return row?.n ?? 0;
}
