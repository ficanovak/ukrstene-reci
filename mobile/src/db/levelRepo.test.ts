/**
 * levelRepo behavioral tests (Task 4.3).
 *
 * These run REAL SQL against an in-memory better-sqlite3 DB exposed via the same
 * `SqliteDb` interface production uses (see testDb.ts) — so cacheLevels' upsert,
 * grid_data JSON round-trip, and getNextLevel's ordering + completed-exclusion
 * are genuinely exercised, not mocked.
 */

import {
  cacheLevels,
  countCachedUncompleted,
  getLevelById,
  getNextLevel,
  type CachedLevelRow,
  type PlayableLevel,
} from "./levelRepo";
import { saveProgress } from "./progressRepo";
import { makeTestDb } from "./testDb";
import type { SqliteDb } from "./sqlite";

const SCOPE = { mode: "basic", languageId: "lang-sr", script: "lat" } as const;

function level(overrides: Partial<PlayableLevel>): PlayableLevel {
  return {
    id: "lvl-1",
    mode: "basic",
    languageId: "lang-sr",
    script: "lat",
    levelNumber: 1,
    difficultyBand: 1,
    gridWidth: 5,
    gridHeight: 5,
    gridData: { cells: [], words: [], clues: {} },
    ...overrides,
  };
}

let db: SqliteDb;
beforeEach(async () => {
  db = await makeTestDb();
});

describe("cacheLevels + getLevelById", () => {
  it("round-trips a level including parsed grid_data", async () => {
    const grid = { cells: [{ kind: "blank" }], words: [{ id: "w0" }], clues: { c0: { type: "text", text: "hi" } } };
    await cacheLevels(db, [level({ id: "lvl-42", levelNumber: 7, gridData: grid })]);

    const got = await getLevelById(db, "lvl-42");
    expect(got).not.toBeNull();
    expect(got!.id).toBe("lvl-42");
    expect(got!.levelNumber).toBe(7);
    expect(got!.mode).toBe("basic");
    expect(got!.languageId).toBe("lang-sr");
    expect(got!.script).toBe("lat");
    expect(got!.gridWidth).toBe(5);
    expect(got!.gridData).toEqual(grid);
  });

  it("returns null for an unknown id", async () => {
    expect(await getLevelById(db, "nope")).toBeNull();
  });

  it("upserts (re-caching the same id updates rather than duplicating)", async () => {
    await cacheLevels(db, [level({ id: "lvl-1", difficultyBand: 1 })]);
    await cacheLevels(db, [level({ id: "lvl-1", difficultyBand: 4 })]);
    const got = await getLevelById(db, "lvl-1");
    expect(got!.difficultyBand).toBe(4);
    const all = await db.getAllAsync<CachedLevelRow>("SELECT * FROM cached_levels", []);
    expect(all).toHaveLength(1);
  });
});

describe("getNextLevel", () => {
  beforeEach(async () => {
    await cacheLevels(db, [
      level({ id: "lvl-c", levelNumber: 3 }),
      level({ id: "lvl-a", levelNumber: 1 }),
      level({ id: "lvl-b", levelNumber: 2 }),
    ]);
  });

  it("returns the lowest-numbered uncompleted level", async () => {
    const next = await getNextLevel(db, SCOPE);
    expect(next!.id).toBe("lvl-a");
    expect(next!.levelNumber).toBe(1);
  });

  it("after completing it, returns the NEXT one", async () => {
    await saveProgress(db, {
      levelId: "lvl-a",
      mode: "basic",
      stars: 3,
      score: 100,
      mistakes: 0,
      hintsUsed: 0,
    });
    const next = await getNextLevel(db, SCOPE);
    expect(next!.id).toBe("lvl-b");
    expect(next!.levelNumber).toBe(2);
  });

  it("returns null when all cached levels are completed", async () => {
    for (const id of ["lvl-a", "lvl-b", "lvl-c"]) {
      await saveProgress(db, { levelId: id, mode: "basic", stars: 1, score: 1, mistakes: 0, hintsUsed: 0 });
    }
    expect(await getNextLevel(db, SCOPE)).toBeNull();
  });

  it("is scoped by mode/language/script", async () => {
    // Completing in basic should not affect advanced.
    await saveProgress(db, { levelId: "lvl-a", mode: "basic", stars: 1, score: 1, mistakes: 0, hintsUsed: 0 });
    await cacheLevels(db, [level({ id: "lvl-adv", levelNumber: 1, mode: "advanced" })]);
    const next = await getNextLevel(db, { ...SCOPE, mode: "advanced" });
    expect(next!.id).toBe("lvl-adv");
  });
});

describe("countCachedUncompleted", () => {
  it("counts cached levels with no progress row, scoped", async () => {
    await cacheLevels(db, [
      level({ id: "lvl-a", levelNumber: 1 }),
      level({ id: "lvl-b", levelNumber: 2 }),
      level({ id: "lvl-c", levelNumber: 3 }),
    ]);
    expect(await countCachedUncompleted(db, SCOPE)).toBe(3);
    await saveProgress(db, { levelId: "lvl-a", mode: "basic", stars: 2, score: 5, mistakes: 0, hintsUsed: 0 });
    expect(await countCachedUncompleted(db, SCOPE)).toBe(2);
  });
});
