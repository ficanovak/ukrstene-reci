import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, truncateAll } from "../../test/prisma.js";
import { buildApp } from "../app.js";

import type { Mode, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";

/**
 * Integration tests for the protected "next unplayed level pack" route
 * (Task 3.3): GET /v1/levels/next.
 *
 * They run against the TEST database (injected test prisma client) and drive
 * the app via `app.inject(...)`. Each test seeds its own Language + Level rows
 * (+ UserProgress completions) and a real User so a valid JWT can be minted via
 * the app's signer.
 *
 * PROGRESSION SEMANTICS UNDER TEST (documented on the service):
 *  - lang is a language CODE (sr/hr/...) resolved to languageId.
 *  - "completed" is by level NUMBER: completing ANY variation of level number N
 *    (a UserProgress row for a level with that number + mode) hides number N.
 *  - one variation per level number is returned, chosen STABLY per user.
 */

// Minimal valid gridData JSON. The Json column accepts any JSON; these query
// tests don't render it, so an empty-ish object is sufficient.
function gridData(n: number): Prisma.InputJsonValue {
  return { cells: [], words: [], clues: {}, marker: n };
}

interface SeedLevelOpts {
  languageId: string;
  mode?: Mode;
  script?: string;
  levelNumber: number;
  variationGroup?: number;
  difficultyBand?: number;
  status?: "active" | "retired";
}

async function makeLevel(opts: SeedLevelOpts): Promise<{ id: string }> {
  return prisma.level.create({
    data: {
      languageId: opts.languageId,
      mode: opts.mode ?? "basic",
      script: opts.script ?? "lat",
      difficultyCoefficient: 1,
      difficultyBand: opts.difficultyBand ?? 1,
      levelNumber: opts.levelNumber,
      variationGroup: opts.variationGroup ?? 1,
      gridWidth: 5,
      gridHeight: 5,
      gridData: gridData(opts.levelNumber),
      status: opts.status ?? "active",
    },
    select: { id: true },
  });
}

async function makeLanguage(code: string): Promise<string> {
  const lang = await prisma.language.create({
    data: { code, name: code.toUpperCase(), supportedScripts: ["lat", "cyr"] },
  });
  return lang.id;
}

async function makeUser(): Promise<string> {
  const user = await prisma.user.create({
    data: { authProvider: "anon", externalId: `dev-${Math.random()}` },
  });
  return user.id;
}

async function complete(
  userId: string,
  levelId: string,
  mode: Mode = "basic",
): Promise<void> {
  await prisma.userProgress.create({
    data: {
      userId,
      levelId,
      mode,
      stars: 3,
      score: 100,
      mistakes: 0,
      hintsUsed: 0,
    },
  });
}

describe("GET /v1/levels/next", () => {
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

  function nextReq(userId: string, query: string) {
    return app.inject({
      method: "GET",
      url: `/v1/levels/next?${query}`,
      headers: { authorization: `Bearer ${tokenFor(userId)}` },
    });
  }

  it("returns 401 when unauthenticated", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/levels/next?mode=basic&lang=sr&script=lat",
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns active, uncompleted levels for the right mode/lang/script, ordered by levelNumber and capped at count", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    for (const n of [3, 1, 2, 4, 5]) {
      await makeLevel({ languageId: sr, levelNumber: n });
    }

    const res = await nextReq(userId, "mode=basic&lang=sr&script=lat&count=3");
    expect(res.statusCode).toBe(200);
    const { levels } = res.json() as {
      levels: { levelNumber: number; gridData: unknown; id: string }[];
    };
    expect(levels.map((l) => l.levelNumber)).toEqual([1, 2, 3]);
    // Includes the playable payload.
    expect(levels[0]).toMatchObject({
      mode: "basic",
      script: "lat",
      languageId: sr,
      levelNumber: 1,
    });
    expect(levels[0].gridData).toBeDefined();
    expect(typeof levels[0].id).toBe("string");
  });

  it("defaults count to 10 when absent", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    for (let n = 1; n <= 60; n++) {
      await makeLevel({ languageId: sr, levelNumber: n });
    }

    const def = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    expect((def.json() as { levels: unknown[] }).levels).toHaveLength(10);

    // Max allowed count (50) is honored exactly.
    const max = await nextReq(userId, "mode=basic&lang=sr&script=lat&count=50");
    expect((max.json() as { levels: unknown[] }).levels).toHaveLength(50);
  });

  it("rejects an invalid/out-of-range count with 400 (no silent clamp)", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    await makeLevel({ languageId: sr, levelNumber: 1 });

    // Non-numeric → 400.
    const nan = await nextReq(userId, "mode=basic&lang=sr&script=lat&count=abc");
    expect(nan.statusCode).toBe(400);

    // Above max → 400 (NOT clamped to 50).
    const tooBig = await nextReq(
      userId,
      "mode=basic&lang=sr&script=lat&count=999",
    );
    expect(tooBig.statusCode).toBe(400);

    // Below min → 400.
    const tooSmall = await nextReq(
      userId,
      "mode=basic&lang=sr&script=lat&count=-5",
    );
    expect(tooSmall.statusCode).toBe(400);
  });

  it("excludes retired levels", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    await makeLevel({ languageId: sr, levelNumber: 1, status: "retired" });
    await makeLevel({ languageId: sr, levelNumber: 2, status: "active" });

    const res = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    const { levels } = res.json() as { levels: { levelNumber: number }[] };
    expect(levels.map((l) => l.levelNumber)).toEqual([2]);
  });

  it("excludes a level NUMBER once the user has completed ANY variation of it", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    // Level number 1 has two variations; completing one of them hides number 1.
    const v1 = await makeLevel({
      languageId: sr,
      levelNumber: 1,
      variationGroup: 1,
    });
    await makeLevel({ languageId: sr, levelNumber: 1, variationGroup: 2 });
    await makeLevel({ languageId: sr, levelNumber: 2 });

    await complete(userId, v1.id, "basic");

    const res = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    const { levels } = res.json() as { levels: { levelNumber: number }[] };
    // Number 1 fully skipped (even though variation 2 is uncompleted); only 2.
    expect(levels.map((l) => l.levelNumber)).toEqual([2]);
  });

  it("completion is mode-specific: completing basic does not hide the level under advanced", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    const basic = await makeLevel({
      languageId: sr,
      mode: "basic",
      levelNumber: 1,
    });
    await makeLevel({ languageId: sr, mode: "advanced", levelNumber: 1 });
    await complete(userId, basic.id, "basic");

    const basicRes = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    expect(
      (basicRes.json() as { levels: { levelNumber: number }[] }).levels,
    ).toEqual([]);

    const advRes = await nextReq(userId, "mode=advanced&lang=sr&script=lat");
    expect(
      (advRes.json() as { levels: { levelNumber: number }[] }).levels.map(
        (l) => l.levelNumber,
      ),
    ).toEqual([1]);
  });

  it("returns exactly one variation per level number, stable across repeated calls for the same user", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    // Two variations of level number 1.
    const a = await makeLevel({
      languageId: sr,
      levelNumber: 1,
      variationGroup: 1,
    });
    const b = await makeLevel({
      languageId: sr,
      levelNumber: 1,
      variationGroup: 2,
    });
    const ids = new Set([a.id, b.id]);

    const first = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    const firstLevels = (first.json() as { levels: { id: string; levelNumber: number }[] })
      .levels;
    expect(firstLevels).toHaveLength(1);
    expect(firstLevels[0].levelNumber).toBe(1);
    expect(ids.has(firstLevels[0].id)).toBe(true);

    // Stable: repeated calls return the same chosen variation id.
    const second = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    const secondLevels = (second.json() as { levels: { id: string }[] }).levels;
    expect(secondLevels[0].id).toBe(firstLevels[0].id);

    const third = await nextReq(userId, "mode=basic&lang=sr&script=lat");
    expect((third.json() as { levels: { id: string }[] }).levels[0].id).toBe(
      firstLevels[0].id,
    );
  });

  it("isolates by language: sr levels are not returned when querying hr", async () => {
    const sr = await makeLanguage("sr");
    const hr = await makeLanguage("hr");
    const userId = await makeUser();
    await makeLevel({ languageId: sr, levelNumber: 1 });
    await makeLevel({ languageId: hr, levelNumber: 7 });

    const res = await nextReq(userId, "mode=basic&lang=hr&script=lat");
    const { levels } = res.json() as {
      levels: { levelNumber: number; languageId: string }[];
    };
    expect(levels).toHaveLength(1);
    expect(levels[0].levelNumber).toBe(7);
    expect(levels[0].languageId).toBe(hr);
  });

  it("isolates by script", async () => {
    const sr = await makeLanguage("sr");
    const userId = await makeUser();
    await makeLevel({ languageId: sr, script: "lat", levelNumber: 1 });
    await makeLevel({ languageId: sr, script: "cyr", levelNumber: 2 });

    const res = await nextReq(userId, "mode=basic&lang=sr&script=cyr");
    const { levels } = res.json() as { levels: { levelNumber: number }[] };
    expect(levels.map((l) => l.levelNumber)).toEqual([2]);
  });

  it("returns 404 for an unknown language code", async () => {
    const userId = await makeUser();
    const res = await nextReq(userId, "mode=basic&lang=zz&script=lat");
    expect(res.statusCode).toBe(404);
  });

  it("rejects invalid query params with 400", async () => {
    const userId = await makeUser();
    const bad = await nextReq(userId, "mode=nope&lang=sr&script=lat");
    expect(bad.statusCode).toBe(400);

    const badScript = await nextReq(userId, "mode=basic&lang=sr&script=xx");
    expect(badScript.statusCode).toBe(400);

    const missingLang = await nextReq(userId, "mode=basic&script=lat");
    expect(missingLang.statusCode).toBe(400);
  });
});
