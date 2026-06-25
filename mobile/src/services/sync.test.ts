/**
 * Offline sync service tests (Task 4.4).
 *
 * The service is fully injectable: a fake `api` (jest mocks), the real `db`
 * (in-memory better-sqlite3 from Task 4.3, exercising the REAL repo SQL), a
 * `getToken`, and a `getCurrentSelection`. So we test the orchestration +
 * real repo behaviour with ONLY the network (api) faked.
 *
 * lang code-vs-id: `getCurrentSelection` returns BOTH the language CODE (`lang`,
 * for the levels query) and the `languageId` (cuid, for the local cache scope).
 * prefetch queries with the CODE and caches levels carrying the server's
 * languageId — asserted below.
 */

import { cacheLevels, countCachedUncompleted } from "../db/levelRepo";
import { getUnsynced, saveProgress } from "../db/progressRepo";
import { makeTestDb } from "../db/testDb";
import type { SqliteDb } from "../db/sqlite";
import type { ApiLevel } from "../api/types";
import { flushProgress, prefetchLevels, sync, type SyncDeps } from "./sync";

const SELECTION = {
  mode: "basic",
  lang: "sr",
  languageId: "lang-sr",
  script: "lat",
} as const;

function makeApi() {
  return {
    authAnon: jest.fn(),
    authSocial: jest.fn(),
    getNextLevels: jest.fn(),
    submitProgress: jest.fn(),
    submitProgressBatch: jest.fn(),
  };
}

function makeLevel(overrides: Partial<ApiLevel>): ApiLevel {
  return {
    id: "lvl-1",
    mode: "basic",
    languageId: "lang-sr",
    script: "lat",
    levelNumber: 1,
    difficultyBand: 1,
    gridWidth: 5,
    gridHeight: 5,
    gridData: { cells: [] },
    ...overrides,
  };
}

let db: SqliteDb;
let api: ReturnType<typeof makeApi>;

function deps(overrides: Partial<SyncDeps> = {}): SyncDeps {
  return {
    api: api as unknown as SyncDeps["api"],
    db,
    getToken: () => "jwt-token",
    getCurrentSelection: () => SELECTION,
    prefetchThreshold: 10,
    prefetchCount: 20,
    ...overrides,
  };
}

beforeEach(async () => {
  db = await makeTestDb();
  api = makeApi();
});

describe("flushProgress", () => {
  it("posts the unsynced rows to the batch endpoint and marks them synced", async () => {
    await saveProgress(db, { levelId: "a", mode: "basic", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 });
    await saveProgress(db, { levelId: "b", mode: "basic", stars: 4, score: 20, mistakes: 1, hintsUsed: 2 });
    api.submitProgressBatch.mockResolvedValue({ ok: true, count: 2 });

    const result = await flushProgress(deps());

    expect(result).toEqual({ ok: true, flushed: 2 });
    expect(api.submitProgressBatch).toHaveBeenCalledTimes(1);
    const [items, token] = api.submitProgressBatch.mock.calls[0];
    expect(token).toBe("jwt-token");
    // The batch carries the backend ProgressInput shape (no local id / synced).
    expect(items).toEqual([
      { levelId: "a", mode: "basic", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 },
      { levelId: "b", mode: "basic", stars: 4, score: 20, mistakes: 1, hintsUsed: 2 },
    ]);
    // Rows are now marked synced.
    expect(await getUnsynced(db)).toHaveLength(0);
  });

  it("makes no network call when there is nothing unsynced", async () => {
    const result = await flushProgress(deps());

    expect(result).toEqual({ ok: true, flushed: 0 });
    expect(api.submitProgressBatch).not.toHaveBeenCalled();
  });

  it("leaves rows unsynced and reports failure when the API throws (offline)", async () => {
    await saveProgress(db, { levelId: "a", mode: "basic", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 });
    api.submitProgressBatch.mockRejectedValue(new TypeError("Network request failed"));

    const result = await flushProgress(deps());

    expect(result.ok).toBe(false);
    expect(result.flushed).toBe(0);
    // The rows remain queued for the next attempt — nothing marked synced.
    expect(await getUnsynced(db)).toHaveLength(1);
  });
});

describe("prefetchLevels", () => {
  it("fetches and caches when the cache is below the threshold", async () => {
    const levels = [
      makeLevel({ id: "s1", levelNumber: 1 }),
      makeLevel({ id: "s2", levelNumber: 2 }),
    ];
    api.getNextLevels.mockResolvedValue({ levels });

    const result = await prefetchLevels(deps());

    expect(result).toEqual({ ok: true, cached: 2 });
    expect(api.getNextLevels).toHaveBeenCalledTimes(1);
    const [query, token] = api.getNextLevels.mock.calls[0];
    // Queries with the language CODE, not the id.
    expect(query).toEqual({ mode: "basic", lang: "sr", script: "lat", count: 20 });
    expect(token).toBe("jwt-token");
    // Levels were cached under the scope (uses languageId from the response).
    expect(await countCachedUncompleted(db, { mode: "basic", languageId: "lang-sr", script: "lat" })).toBe(2);
  });

  it("does NOT fetch when the cache is at/above the threshold", async () => {
    // Seed 10 uncompleted cached levels (threshold = 10).
    const seed = Array.from({ length: 10 }, (_, i) =>
      makeLevel({ id: `seed-${i}`, levelNumber: i + 1 }),
    );
    await cacheLevels(db, seed);

    const result = await prefetchLevels(deps());

    expect(result).toEqual({ ok: true, cached: 0 });
    expect(api.getNextLevels).not.toHaveBeenCalled();
  });

  it("reports failure (no crash) when the levels fetch throws (offline)", async () => {
    api.getNextLevels.mockRejectedValue(new TypeError("Network request failed"));

    const result = await prefetchLevels(deps());

    expect(result.ok).toBe(false);
    expect(result.cached).toBe(0);
  });
});

describe("sync", () => {
  it("runs flush then prefetch and reports a combined status", async () => {
    await saveProgress(db, { levelId: "a", mode: "basic", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 });
    api.submitProgressBatch.mockResolvedValue({ ok: true, count: 1 });
    api.getNextLevels.mockResolvedValue({ levels: [makeLevel({ id: "s1" })] });

    const result = await sync(deps());

    expect(result.flush).toEqual({ ok: true, flushed: 1 });
    expect(result.prefetch).toEqual({ ok: true, cached: 1 });
    expect(result.ok).toBe(true);
    expect(await getUnsynced(db)).toHaveLength(0);
  });

  it("degrades gracefully when offline (both legs fail, no throw)", async () => {
    await saveProgress(db, { levelId: "a", mode: "basic", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 });
    api.submitProgressBatch.mockRejectedValue(new TypeError("offline"));
    api.getNextLevels.mockRejectedValue(new TypeError("offline"));

    const result = await sync(deps());

    expect(result.ok).toBe(false);
    expect(result.flush.ok).toBe(false);
    expect(result.prefetch.ok).toBe(false);
    // Progress is preserved for the next attempt.
    expect(await getUnsynced(db)).toHaveLength(1);
  });

  it("still prefetches even if flush had nothing to do", async () => {
    api.getNextLevels.mockResolvedValue({ levels: [makeLevel({ id: "s1" })] });

    const result = await sync(deps());

    expect(result.flush).toEqual({ ok: true, flushed: 0 });
    expect(result.prefetch.cached).toBe(1);
    expect(result.ok).toBe(true);
  });
});
