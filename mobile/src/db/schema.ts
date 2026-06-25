/**
 * Local SQLite schema for the offline-first client (Task 4.3).
 *
 * Two tables mirror the SERVER essentials the client needs while offline:
 *
 *   - `cached_levels`: a local cache of playable levels fetched from
 *     `GET /v1/levels/next` (see backend `PlayableLevel`). One row per server
 *     level id. `grid_data` is the level's `gridData` object stored as a JSON
 *     TEXT string (it round-trips losslessly through JSON.stringify/parse — see
 *     backend `gridData.ts`). The client picks the lowest uncompleted
 *     `level_number` to play next, so we keep `level_number`, `mode`,
 *     `language_id` and `script` to scope/order the cache the same way the
 *     server orders its progression (ascending by `levelNumber`).
 *
 *   - `local_progress`: locally-recorded results for completed levels, queued
 *     for sync (Task 4.4: getUnsynced → POST batch → markSynced). UNIQUE on
 *     (level_id, mode) so re-completing a level UPDATES the row (best-result)
 *     rather than duplicating it — matching the server's per-(user,level,mode)
 *     uniqueness + best-result policy (backend `progress.ts`).
 *
 * COMPLETION KEY (documented decision):
 *   The server tracks completion by level NUMBER (a number can have several
 *   variations). The client only ever caches ONE variation per number (the
 *   server returns one stable variation per number per user), so on the client
 *   "completed level number N" and "completed the cached level row for N" are
 *   equivalent. We therefore key local_progress on the cached level's id
 *   (level_id) and exclude its number from `getNextLevel` via that row. This is
 *   simpler than re-deriving numbers and is sound given the one-variation
 *   invariant.
 *
 * The `migrate(db)` function creates both tables IF NOT EXISTS, so it is safe to
 * call on every app launch. There is no `meta` table — YAGNI; the sync cursor /
 * current language are not needed by these repositories.
 */

import type { SqliteDb } from "./sqlite";

/** DDL for the cached levels table (cache of server `PlayableLevel`s). */
export const CREATE_CACHED_LEVELS = `
  CREATE TABLE IF NOT EXISTS cached_levels (
    id              TEXT PRIMARY KEY NOT NULL,
    mode            TEXT NOT NULL,
    language_id     TEXT NOT NULL,
    script          TEXT NOT NULL,
    level_number    INTEGER NOT NULL,
    difficulty_band INTEGER NOT NULL,
    grid_width      INTEGER NOT NULL,
    grid_height     INTEGER NOT NULL,
    grid_data       TEXT NOT NULL,
    cached_at       TEXT NOT NULL
  );
`;

/**
 * Index to make `getNextLevel`'s "lowest uncompleted level_number for this
 * mode/language/script" lookup fast and its ordering cheap.
 */
export const CREATE_CACHED_LEVELS_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_cached_levels_progression
    ON cached_levels (mode, language_id, script, level_number);
`;

/** DDL for the local progress queue (one row per completed (level, mode)). */
export const CREATE_LOCAL_PROGRESS = `
  CREATE TABLE IF NOT EXISTS local_progress (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    level_id     TEXT NOT NULL,
    mode         TEXT NOT NULL,
    stars        INTEGER NOT NULL,
    score        INTEGER NOT NULL,
    mistakes     INTEGER NOT NULL,
    hints_used   INTEGER NOT NULL,
    completed_at TEXT NOT NULL,
    synced       INTEGER NOT NULL DEFAULT 0,
    UNIQUE (level_id, mode)
  );
`;

/**
 * Create all tables/indexes if they do not already exist. Idempotent — safe to
 * run on every launch. Statements are run individually (some SQLite drivers'
 * single-statement helpers reject multi-statement strings).
 */
export async function migrate(db: SqliteDb): Promise<void> {
  await db.runAsync(CREATE_CACHED_LEVELS, []);
  await db.runAsync(CREATE_CACHED_LEVELS_INDEX, []);
  await db.runAsync(CREATE_LOCAL_PROGRESS, []);
}
