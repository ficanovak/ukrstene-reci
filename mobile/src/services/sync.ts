/**
 * Offline sync service (Task 4.4): flush locally-queued progress to the server
 * and prefetch level packs when the local cache runs low.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * INJECTION / TESTABILITY
 * ───────────────────────────────────────────────────────────────────────────
 * Everything is injected via {@link SyncDeps}: the `api` client, the `db`
 * handle, a `getToken`, and a `getCurrentSelection`. The repo functions
 * (levelRepo / progressRepo) run their REAL SQL against the injected `db`, so
 * tests pass the in-memory better-sqlite3 adapter (Task 4.3 testDb) and a faked
 * `api` — exercising real cache/queue behaviour with ONLY the network mocked.
 *
 * lang CODE vs languageId
 *   `getCurrentSelection` returns BOTH the language CODE (`lang`, e.g. "sr") and
 *   the `languageId` (cuid). prefetch QUERIES the server with the CODE (what
 *   `/v1/levels/next` expects) and counts the local cache by `languageId` (the
 *   scope the cached rows store). The server's returned levels carry the
 *   `languageId`, which `cacheLevels` persists — so the two stay consistent.
 *
 * OFFLINE TOLERANCE
 *   Each operation catches network/API errors and returns a status object
 *   (never throws to the caller), so a connectivity blip degrades gracefully:
 *   unsynced progress stays queued (idempotent server upsert means re-flushing
 *   is safe), and the cache is simply left as-is until the next attempt.
 */

import {
  cacheLevels,
  countCachedUncompleted,
  type LevelScope,
} from "../db/levelRepo";
import { getUnsynced, markSynced } from "../db/progressRepo";
import type { SqliteDb } from "../db/sqlite";
import type { ApiClient } from "../api/client";
import type { NextLevelsQuery, ProgressInput } from "../api/types";

/** The mode/language the player is currently on. See module doc for code-vs-id. */
export interface CurrentSelection {
  mode: string;
  /** Language CODE (sr/hr/...) — used to QUERY `/v1/levels/next`. */
  lang: string;
  /** Language id (cuid) — used as the local cache SCOPE. */
  languageId: string;
  script: string;
}

/** Injected dependencies (see module doc). All required except the tunables. */
export interface SyncDeps {
  api: ApiClient;
  db: SqliteDb;
  getToken: () => string | undefined;
  getCurrentSelection: () => CurrentSelection;
  /** Prefetch when the uncompleted-cache count drops below this. Default 10. */
  prefetchThreshold?: number;
  /** How many levels to request per prefetch. Default 20. */
  prefetchCount?: number;
}

const DEFAULT_PREFETCH_THRESHOLD = 10;
const DEFAULT_PREFETCH_COUNT = 20;

/** Result of {@link flushProgress}. `ok=false` ⇒ offline/failed, rows kept. */
export interface FlushResult {
  ok: boolean;
  /** How many rows were successfully flushed + marked synced. */
  flushed: number;
}

/** Result of {@link prefetchLevels}. `ok=false` ⇒ the fetch failed. */
export interface PrefetchResult {
  ok: boolean;
  /** How many levels were cached this run (0 if above threshold or failed). */
  cached: number;
}

/** Combined result of a full {@link sync}. `ok` is the AND of both legs. */
export interface SyncResult {
  ok: boolean;
  flush: FlushResult;
  prefetch: PrefetchResult;
}

/**
 * Flush unsynced local progress to `POST /v1/progress/batch`, then mark the
 * flushed rows synced. No unsynced rows ⇒ no network call. On API/network
 * failure the rows are left unsynced and `{ ok: false, flushed: 0 }` is
 * returned (no throw). Idempotent: the server upserts, so re-flushing is safe.
 */
export async function flushProgress(deps: SyncDeps): Promise<FlushResult> {
  const { api, db, getToken } = deps;

  const unsynced = await getUnsynced(db);
  if (unsynced.length === 0) {
    return { ok: true, flushed: 0 };
  }

  const items: ProgressInput[] = unsynced.map((row) => ({
    levelId: row.levelId,
    mode: row.mode,
    stars: row.stars,
    score: row.score,
    mistakes: row.mistakes,
    hintsUsed: row.hintsUsed,
  }));

  try {
    await api.submitProgressBatch(items, getToken());
  } catch {
    // Offline / server error: leave rows queued for the next attempt.
    return { ok: false, flushed: 0 };
  }

  await markSynced(db, unsynced.map((row) => row.id));
  return { ok: true, flushed: unsynced.length };
}

/**
 * Prefetch more levels when the local uncompleted cache for the current
 * selection is below `prefetchThreshold`. Queries the server with the language
 * CODE and caches the returned levels (which carry the server `languageId`).
 * At/above threshold ⇒ no fetch. On failure ⇒ `{ ok: false, cached: 0 }`.
 */
export async function prefetchLevels(deps: SyncDeps): Promise<PrefetchResult> {
  const { api, db, getToken, getCurrentSelection } = deps;
  const threshold = deps.prefetchThreshold ?? DEFAULT_PREFETCH_THRESHOLD;
  const count = deps.prefetchCount ?? DEFAULT_PREFETCH_COUNT;

  const selection = getCurrentSelection();
  const scope: LevelScope = {
    mode: selection.mode,
    languageId: selection.languageId,
    script: selection.script,
  };

  const cached = await countCachedUncompleted(db, scope);
  if (cached >= threshold) {
    return { ok: true, cached: 0 };
  }

  const query: NextLevelsQuery = {
    mode: selection.mode,
    lang: selection.lang, // CODE, not languageId — see module doc.
    script: selection.script,
    count,
  };

  let levels;
  try {
    ({ levels } = await api.getNextLevels(query, getToken()));
  } catch {
    return { ok: false, cached: 0 };
  }

  // The returned levels carry the server-resolved `languageId`; cacheLevels
  // persists it, keeping the cache scope consistent with future counts.
  await cacheLevels(db, levels);
  return { ok: true, cached: levels.length };
}

/**
 * Run a full sync: flush queued progress, then prefetch levels. Tolerant of
 * being offline — each leg degrades independently. `ok` is true only if both
 * legs succeeded.
 */
export async function sync(deps: SyncDeps): Promise<SyncResult> {
  const flush = await flushProgress(deps);
  const prefetch = await prefetchLevels(deps);
  return { ok: flush.ok && prefetch.ok, flush, prefetch };
}
