import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, truncateAll } from "../../test/prisma.js";
import { buildApp } from "../app.js";
import { getNextLevels } from "../services/levels.js";

import type { Mode, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";

/**
 * Integration tests for the protected progress-submission routes (Task 3.4):
 *   POST /v1/progress        — record one completed level result
 *   POST /v1/progress/batch  — flush a queue of offline results
 *
 * They run against the TEST database (injected test prisma client) and drive
 * the app via `app.inject(...)`. Each test seeds its own Language + Level rows
 * and a real User so a valid JWT can be minted via the app's signer.
 *
 * POLICY UNDER TEST (documented on the service + routes):
 *  - stars are 1–5 for a completed level (a completion always earns ≥1 star).
 *  - UPSERT keyed on the unique (userId, levelId, mode).
 *  - Idempotent re-submit: the same payload twice → ONE row, no error.
 *  - BEST-RESULT on conflict: higher stars wins; score breaks a stars tie. A
 *    worse/older replay never downgrades the stored result (both directions).
 *  - Batch is capped (200) and atomic; same best-result + idempotency applies.
 *  - The progress→serve loop: after submitting, getNextLevels no longer serves
 *    that level number for the user.
 */

function gridData(n: number): Prisma.InputJsonValue {
  return { cells: [], words: [], clues: {}, marker: n };
}

async function makeLanguage(code: string): Promise<string> {
  const lang = await prisma.language.create({
    data: { code, name: code.toUpperCase(), supportedScripts: ["lat", "cyr"] },
  });
  return lang.id;
}

interface SeedLevelOpts {
  languageId: string;
  mode?: Mode;
  script?: string;
  levelNumber: number;
}

async function makeLevel(opts: SeedLevelOpts): Promise<{ id: string }> {
  return prisma.level.create({
    data: {
      languageId: opts.languageId,
      mode: opts.mode ?? "basic",
      script: opts.script ?? "lat",
      difficultyCoefficient: 1,
      difficultyBand: 1,
      levelNumber: opts.levelNumber,
      variationGroup: 1,
      gridWidth: 5,
      gridHeight: 5,
      gridData: gridData(opts.levelNumber),
      status: "active",
    },
    select: { id: true },
  });
}

async function makeUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { authProvider: "anon", externalId: `dev-${Math.random()}` },
  });
  return user.id;
}

interface ResultBody {
  levelId: string;
  mode?: Mode;
  stars: number;
  score: number;
  mistakes?: number;
  hintsUsed?: number;
}

function fullBody(b: ResultBody) {
  return {
    levelId: b.levelId,
    mode: b.mode ?? "basic",
    stars: b.stars,
    score: b.score,
    mistakes: b.mistakes ?? 0,
    hintsUsed: b.hintsUsed ?? 0,
  };
}

describe("progress routes (Task 3.4)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateAll();
    app = buildApp({ prisma });
    await app.ready();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function tokenFor(userId: string): string {
    return app.jwt.sign({ sub: userId });
  }

  function submit(userId: string, body: ResultBody) {
    return app.inject({
      method: "POST",
      url: "/v1/progress",
      headers: { authorization: `Bearer ${tokenFor(userId)}` },
      payload: fullBody(body),
    });
  }

  function submitBatch(userId: string, items: ResultBody[]) {
    return app.inject({
      method: "POST",
      url: "/v1/progress/batch",
      headers: { authorization: `Bearer ${tokenFor(userId)}` },
      payload: { items: items.map(fullBody) },
    });
  }

  describe("POST /v1/progress", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/progress",
        payload: { levelId: "x", mode: "basic", stars: 3, score: 1, mistakes: 0, hintsUsed: 0 },
      });
      expect(res.statusCode).toBe(401);
    });

    it("creates a UserProgress row for (userId, levelId, mode)", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      const res = await submit(userId, {
        levelId: level.id,
        stars: 3,
        score: 120,
        mistakes: 2,
        hintsUsed: 1,
      });
      expect(res.statusCode).toBe(200);

      const rows = await prisma.userProgress.findMany({
        where: { userId, levelId: level.id, mode: "basic" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        stars: 3,
        score: 120,
        mistakes: 2,
        hintsUsed: 1,
      });
    });

    it("is idempotent: submitting the same result twice yields ONE row", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });
      const body = { levelId: level.id, stars: 4, score: 200 };

      const first = await submit(userId, body);
      const second = await submit(userId, body);
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const rows = await prisma.userProgress.findMany({
        where: { userId, levelId: level.id, mode: "basic" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].stars).toBe(4);
    });

    it("best-result: a higher resubmit upgrades (3★ then 5★ → 5★)", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      await submit(userId, { levelId: level.id, stars: 3, score: 100 });
      await submit(userId, { levelId: level.id, stars: 5, score: 50 });

      const row = await prisma.userProgress.findFirst({
        where: { userId, levelId: level.id, mode: "basic" },
      });
      expect(row?.stars).toBe(5);
      expect(row?.score).toBe(50);
    });

    it("best-result: a worse resubmit does NOT downgrade (5★ then 3★ → stays 5★)", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      await submit(userId, { levelId: level.id, stars: 5, score: 300 });
      await submit(userId, { levelId: level.id, stars: 3, score: 999 });

      const row = await prisma.userProgress.findFirst({
        where: { userId, levelId: level.id, mode: "basic" },
      });
      expect(row?.stars).toBe(5);
      expect(row?.score).toBe(300);
    });

    it("best-result: ties on stars are broken by higher score", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      await submit(userId, { levelId: level.id, stars: 4, score: 100 });
      await submit(userId, { levelId: level.id, stars: 4, score: 250 }); // higher score wins
      await submit(userId, { levelId: level.id, stars: 4, score: 80 }); // lower ignored

      const row = await prisma.userProgress.findFirst({
        where: { userId, levelId: level.id, mode: "basic" },
      });
      expect(row?.stars).toBe(4);
      expect(row?.score).toBe(250);
    });

    it("rejects out-of-range stars with 400", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      const tooHigh = await submit(userId, { levelId: level.id, stars: 6, score: 1 });
      expect(tooHigh.statusCode).toBe(400);

      const tooLow = await submit(userId, { levelId: level.id, stars: 0, score: 1 });
      expect(tooLow.statusCode).toBe(400);
    });

    it("rejects negative score/mistakes/hintsUsed with 400", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      const negScore = await submit(userId, { levelId: level.id, stars: 3, score: -1 });
      expect(negScore.statusCode).toBe(400);

      const negMistakes = await submit(userId, {
        levelId: level.id,
        stars: 3,
        score: 1,
        mistakes: -2,
      });
      expect(negMistakes.statusCode).toBe(400);
    });

    it("rejects a bad mode enum with 400", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      const res = await app.inject({
        method: "POST",
        url: "/v1/progress",
        headers: { authorization: `Bearer ${tokenFor(userId)}` },
        payload: { levelId: level.id, mode: "expert", stars: 3, score: 1, mistakes: 0, hintsUsed: 0 },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 for a non-existent levelId and creates no row", async () => {
      await makeLanguage("sr");
      const userId = await makeUser();

      const res = await submit(userId, {
        levelId: "does-not-exist",
        stars: 3,
        score: 100,
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: expect.stringContaining("does-not-exist") });

      const rows = await prisma.userProgress.findMany({ where: { userId } });
      expect(rows).toHaveLength(0);
    });

    it("closes the progress→serve loop: a completed level number is no longer served", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const l1 = await makeLevel({ languageId: sr, levelNumber: 1 });
      await makeLevel({ languageId: sr, levelNumber: 2 });

      // Before: number 1 is served.
      const before = await getNextLevels(prisma, {
        userId,
        languageId: sr,
        mode: "basic",
        script: "lat",
        count: 10,
      });
      expect(before.map((l) => l.levelNumber)).toEqual([1, 2]);

      await submit(userId, { levelId: l1.id, stars: 3, score: 100 });

      // After: number 1 excluded.
      const after = await getNextLevels(prisma, {
        userId,
        languageId: sr,
        mode: "basic",
        script: "lat",
        count: 10,
      });
      expect(after.map((l) => l.levelNumber)).toEqual([2]);
    });
  });

  describe("POST /v1/progress/batch", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/progress/batch",
        payload: { items: [] },
      });
      expect(res.statusCode).toBe(401);
    });

    it("upserts a batch of 3 items → 3 rows", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const a = await makeLevel({ languageId: sr, levelNumber: 1 });
      const b = await makeLevel({ languageId: sr, levelNumber: 2 });
      const c = await makeLevel({ languageId: sr, levelNumber: 3 });

      const res = await submitBatch(userId, [
        { levelId: a.id, stars: 3, score: 100 },
        { levelId: b.id, stars: 4, score: 200 },
        { levelId: c.id, stars: 5, score: 300 },
      ]);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, count: 3 });

      const rows = await prisma.userProgress.findMany({ where: { userId } });
      expect(rows).toHaveLength(3);
    });

    it("is idempotent + best-result: resubmitting the same batch keeps 3 rows and best values", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const a = await makeLevel({ languageId: sr, levelNumber: 1 });
      const b = await makeLevel({ languageId: sr, levelNumber: 2 });
      const c = await makeLevel({ languageId: sr, levelNumber: 3 });

      await submitBatch(userId, [
        { levelId: a.id, stars: 3, score: 100 },
        { levelId: b.id, stars: 4, score: 200 },
        { levelId: c.id, stars: 5, score: 300 },
      ]);
      // Resubmit: a upgraded, b worse (ignored), c same.
      await submitBatch(userId, [
        { levelId: a.id, stars: 5, score: 500 },
        { levelId: b.id, stars: 1, score: 10 },
        { levelId: c.id, stars: 5, score: 300 },
      ]);

      const rows = await prisma.userProgress.findMany({ where: { userId } });
      expect(rows).toHaveLength(3);
      const byLevel = Object.fromEntries(rows.map((r) => [r.levelId, r]));
      expect(byLevel[a.id].stars).toBe(5);
      expect(byLevel[b.id].stars).toBe(4); // not downgraded
      expect(byLevel[c.id].stars).toBe(5);
    });

    it("rejects an oversized batch (>200) with 400", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      const items = Array.from({ length: 201 }, () => ({
        levelId: level.id,
        stars: 3,
        score: 1,
      }));
      const res = await submitBatch(userId, items);
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 when any levelId is unknown and writes NOTHING (atomic)", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const valid = await makeLevel({ languageId: sr, levelNumber: 1 });

      const res = await submitBatch(userId, [
        { levelId: valid.id, stars: 3, score: 100 },
        { levelId: "does-not-exist", stars: 4, score: 200 },
      ]);
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: expect.stringContaining("does-not-exist") });

      // Atomicity: the valid item must NOT have been written either.
      const rows = await prisma.userProgress.findMany({ where: { userId } });
      expect(rows).toHaveLength(0);
    });

    it("rejects a batch with an invalid item (400) and writes nothing (atomic)", async () => {
      const sr = await makeLanguage("sr");
      const userId = await makeUser();
      const level = await makeLevel({ languageId: sr, levelNumber: 1 });

      const res = await submitBatch(userId, [
        { levelId: level.id, stars: 3, score: 100 },
        { levelId: level.id, stars: 99, score: 1 }, // invalid stars
      ]);
      expect(res.statusCode).toBe(400);

      const rows = await prisma.userProgress.findMany({ where: { userId } });
      expect(rows).toHaveLength(0);
    });
  });
});
