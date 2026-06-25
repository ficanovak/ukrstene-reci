/**
 * progressRepo behavioral tests (Task 4.3).
 *
 * Real SQL against an in-memory better-sqlite3 DB (see testDb.ts): the
 * best-result upsert, the (level_id, mode) unique constraint, and the
 * unsynced/markSynced flow are exercised for real, not mocked. The best-result
 * policy mirrors the server (backend progress.ts): higher stars wins, score
 * breaks ties; never downgrade.
 */

import {
  getUnsynced,
  markSynced,
  saveProgress,
  type LocalProgressRow,
} from "./progressRepo";
import { makeTestDb } from "./testDb";
import type { SqliteDb } from "./sqlite";

const base = { mode: "basic" as const, mistakes: 0, hintsUsed: 0 };

let db: SqliteDb;
beforeEach(async () => {
  db = await makeTestDb();
});

async function allRows(d: SqliteDb): Promise<LocalProgressRow[]> {
  return d.getAllAsync<LocalProgressRow>("SELECT * FROM local_progress ORDER BY id", []);
}

describe("saveProgress best-result upsert", () => {
  it("3 then 5 stars -> keeps 5", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 100 });
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 5, score: 50 });
    const rows = await allRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(5);
    expect(rows[0].score).toBe(50);
  });

  it("5 then 3 stars -> stays 5 (no downgrade)", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 5, score: 50 });
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 999 });
    const rows = await allRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].stars).toBe(5);
    expect(rows[0].score).toBe(50);
  });

  it("same stars -> higher score wins", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 4, score: 100 });
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 4, score: 250 });
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 4, score: 120 });
    const rows = await allRows(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(250);
  });

  it("an improving save flips synced back to 0", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 10 });
    await markSynced(db, [(await allRows(db))[0].id]);
    expect((await allRows(db))[0].synced).toBe(1);

    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 5, score: 10 });
    expect((await allRows(db))[0].synced).toBe(0);
  });

  it("a non-improving replay does NOT touch synced (stays 1)", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 5, score: 100 });
    await markSynced(db, [(await allRows(db))[0].id]);
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 100 });
    expect((await allRows(db))[0].synced).toBe(1);
  });

  it("re-saving identical progress does not duplicate rows", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 10 });
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 10 });
    expect(await allRows(db)).toHaveLength(1);
  });

  it("different mode for same level is a separate row", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 10 });
    await saveProgress(db, { levelId: "lvl-1", mode: "advanced", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 });
    expect(await allRows(db)).toHaveLength(2);
  });
});

describe("getUnsynced + markSynced", () => {
  it("getUnsynced returns only unsynced rows; markSynced flips them", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 10 });
    await saveProgress(db, { ...base, levelId: "lvl-2", stars: 4, score: 20 });
    await saveProgress(db, { ...base, levelId: "lvl-3", stars: 5, score: 30 });

    let unsynced = await getUnsynced(db);
    expect(unsynced).toHaveLength(3);

    const idsToSync = [unsynced[0].id, unsynced[1].id];
    await markSynced(db, idsToSync);

    unsynced = await getUnsynced(db);
    expect(unsynced).toHaveLength(1);
    expect(unsynced[0].levelId).toBe("lvl-3");
  });

  it("getUnsynced carries the fields a sync batch needs", async () => {
    await saveProgress(db, { levelId: "lvl-9", mode: "advanced", stars: 4, score: 77, mistakes: 2, hintsUsed: 1 });
    const [row] = await getUnsynced(db);
    expect(row).toMatchObject({
      levelId: "lvl-9",
      mode: "advanced",
      stars: 4,
      score: 77,
      mistakes: 2,
      hintsUsed: 1,
    });
    expect(typeof row.completedAt).toBe("string");
  });

  it("markSynced with an empty list is a no-op", async () => {
    await saveProgress(db, { ...base, levelId: "lvl-1", stars: 3, score: 10 });
    await expect(markSynced(db, [])).resolves.toBeUndefined();
    expect(await getUnsynced(db)).toHaveLength(1);
  });
});
