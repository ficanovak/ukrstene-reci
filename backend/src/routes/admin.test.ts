import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, truncateAll } from "../../test/prisma.js";
import { buildApp } from "../app.js";
import { runGenerate, runRegenerate } from "../services/admin.js";

import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";

/**
 * Integration tests for the admin-only endpoints (Task 3.5):
 *   POST /v1/admin/dictionary  — bulk-insert dictionary words (+clues)
 *   POST /v1/admin/generate    — fire-and-forget bulk level generation
 *   POST /v1/admin/regenerate  — retire active levels + create fresh ones
 *
 * They run against the TEST database and drive the app via `app.inject(...)`.
 * The admin guard is an API-KEY preHandler (NOT the user-JWT `authenticate`);
 * the key is injected via `buildApp({ prisma, adminKey: ADMIN_KEY })`.
 *
 * ASYNC GENERATE SPLIT (documented): the HTTP route kicks the generation job
 * off WITHOUT awaiting and returns 202 + jobId immediately, so a slow job never
 * blocks the request. To assert the actual DB effect deterministically (no
 * flaky background timers), these tests call the awaitable SERVICE functions
 * (`runGenerate`, `runRegenerate`) directly and await them.
 */

const ADMIN_KEY = "test-admin-key";

async function makeLanguage(code: string): Promise<string> {
  const lang = await prisma.language.create({
    data: { code, name: code.toUpperCase(), supportedScripts: ["lat", "cyr"] },
  });
  return lang.id;
}

/** Seed a small but real dictionary so generateLevel can place words. */
async function seedDictionary(languageId: string, script = "lat"): Promise<void> {
  const words = [
    "mama", "tata", "kuca", "more", "sunce", "voda", "nebo", "drvo",
    "ruka", "noga", "oko", "usta", "kosa", "zima", "leto", "reka",
  ];
  for (const word of words) {
    await prisma.dictionary.create({
      data: {
        languageId,
        word,
        script,
        frequency: 0.5,
        length: word.length,
        clues: { create: { type: "text", content: `clue for ${word}` } },
      },
    });
  }
}

function gridData(n: number): Prisma.InputJsonValue {
  return { width: 5, height: 5, cells: [], words: [], clues: {}, marker: n };
}

async function makeActiveLevel(
  languageId: string,
  levelNumber: number,
  script = "lat",
): Promise<{ id: string }> {
  return prisma.level.create({
    data: {
      languageId,
      mode: "basic",
      script,
      difficultyCoefficient: 1,
      difficultyBand: 1,
      levelNumber,
      variationGroup: levelNumber,
      gridWidth: 5,
      gridHeight: 5,
      gridData: gridData(levelNumber),
      status: "active",
    },
    select: { id: true },
  });
}

describe("admin routes (Task 3.5)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await truncateAll();
    app = buildApp({ prisma, adminKey: ADMIN_KEY });
    await app.ready();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // `null` => omit the header entirely; a string => send that key; default => the
  // valid ADMIN_KEY. (We use a `null` sentinel rather than `undefined` because
  // passing `undefined` for a defaulted param re-selects the default in JS.)
  function adminPost(url: string, payload: unknown, key: string | null = ADMIN_KEY) {
    return app.inject({
      method: "POST",
      url,
      headers: key === null ? {} : { "x-admin-key": key },
      payload: payload as object,
    });
  }

  describe("admin-key guard", () => {
    const routes = [
      "/v1/admin/dictionary",
      "/v1/admin/generate",
      "/v1/admin/regenerate",
    ];

    it("rejects a MISSING x-admin-key with 403 on every admin route", async () => {
      for (const url of routes) {
        const res = await adminPost(url, {}, null);
        expect(res.statusCode).toBe(403);
      }
    });

    it("rejects a WRONG x-admin-key with 403 on every admin route", async () => {
      for (const url of routes) {
        const res = await adminPost(url, {}, "nope");
        expect(res.statusCode).toBe(403);
      }
    });

    it("fails CLOSED: when no adminKey is configured, the correct-looking key is still 403", async () => {
      const closed = buildApp({ prisma, adminKey: undefined });
      await closed.ready();
      // Even an empty / any header must be rejected when the server has no key.
      const res = await closed.inject({
        method: "POST",
        url: "/v1/admin/dictionary",
        headers: { "x-admin-key": "" },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
      await closed.close();
    });

    it("allows the correct x-admin-key through the guard (not 403)", async () => {
      const sr = await makeLanguage("sr");
      const res = await adminPost("/v1/admin/dictionary", {
        languageId: sr,
        script: "lat",
        words: [{ word: "test", frequency: 0.5 }],
      });
      expect(res.statusCode).not.toBe(403);
      expect(res.statusCode).toBe(200);
    });
  });

  describe("POST /v1/admin/dictionary", () => {
    it("inserts words and their clues, resolvable by languageCode", async () => {
      await makeLanguage("sr");
      const res = await adminPost("/v1/admin/dictionary", {
        languageCode: "sr",
        script: "lat",
        words: [
          {
            word: "mama",
            frequency: 0.9,
            clue: { type: "text", text: "majka" },
          },
          {
            word: "tata",
            frequency: 0.8,
            length: 4,
            clue: { type: "image", imageRef: "tata.png" },
          },
          { word: "kuca", frequency: 0.7 },
        ],
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, created: 3 });

      const rows = await prisma.dictionary.findMany({
        where: { script: "lat" },
        include: { clues: true },
        orderBy: { word: "asc" },
      });
      expect(rows).toHaveLength(3);
      const mama = rows.find((r) => r.word === "mama")!;
      expect(mama.frequency).toBe(0.9);
      expect(mama.length).toBe(4); // derived from word when not given
      expect(mama.clues[0]).toMatchObject({ type: "text", content: "majka" });

      const tata = rows.find((r) => r.word === "tata")!;
      expect(tata.clues[0]).toMatchObject({ type: "image", content: "tata.png" });

      const kuca = rows.find((r) => r.word === "kuca")!;
      expect(kuca.clues).toHaveLength(0); // no clue provided
    });

    it("skip-if-exists: re-posting the same words does NOT duplicate", async () => {
      const sr = await makeLanguage("sr");
      const body = {
        languageId: sr,
        script: "lat",
        words: [
          { word: "mama", frequency: 0.9 },
          { word: "tata", frequency: 0.8 },
        ],
      };
      const first = await adminPost("/v1/admin/dictionary", body);
      expect(first.json()).toMatchObject({ created: 2 });

      const second = await adminPost("/v1/admin/dictionary", body);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ created: 0 }); // skipped, no dupes

      const rows = await prisma.dictionary.findMany({ where: { languageId: sr } });
      expect(rows).toHaveLength(2);
    });

    it("returns 404 for an unknown languageCode", async () => {
      const res = await adminPost("/v1/admin/dictionary", {
        languageCode: "xx",
        script: "lat",
        words: [{ word: "mama", frequency: 0.5 }],
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for an invalid body (missing words)", async () => {
      const sr = await makeLanguage("sr");
      const res = await adminPost("/v1/admin/dictionary", {
        languageId: sr,
        script: "lat",
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when the batch exceeds the cap", async () => {
      const sr = await makeLanguage("sr");
      const words = Array.from({ length: 1001 }, (_, i) => ({
        word: `w${i}`,
        frequency: 0.5,
      }));
      const res = await adminPost("/v1/admin/dictionary", {
        languageId: sr,
        script: "lat",
        words,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /v1/admin/generate (HTTP)", () => {
    it("returns 202 + jobId immediately (fire-and-forget)", async () => {
      const sr = await makeLanguage("sr");
      await seedDictionary(sr);
      const res = await adminPost("/v1/admin/generate", {
        languageId: sr,
        script: "lat",
        mode: "basic",
        levelCount: 1,
        variationsPerLevel: 1,
        seed: 123,
      });
      expect(res.statusCode).toBe(202);
      expect(res.json()).toMatchObject({ ok: true });
      expect(typeof res.json().jobId).toBe("string");
    });

    it("returns 404 for an unknown languageCode", async () => {
      const res = await adminPost("/v1/admin/generate", {
        languageCode: "xx",
        script: "lat",
        mode: "basic",
        levelCount: 1,
        variationsPerLevel: 1,
        seed: 1,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for an invalid body", async () => {
      const sr = await makeLanguage("sr");
      const res = await adminPost("/v1/admin/generate", {
        languageId: sr,
        script: "lat",
        mode: "expert", // invalid
        levelCount: 1,
        variationsPerLevel: 1,
        seed: 1,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("runGenerate service (awaitable path)", () => {
    it("creates ACTIVE Level rows for the language/script/mode", async () => {
      const sr = await makeLanguage("sr");
      await seedDictionary(sr);

      const result = await runGenerate(prisma, {
        languageId: sr,
        script: "lat",
        mode: "basic",
        levelCount: 3,
        variationsPerLevel: 2,
        seed: 999,
      });

      expect(result.created).toBeGreaterThan(0);

      const levels = await prisma.level.findMany({
        where: { languageId: sr, script: "lat", mode: "basic", status: "active" },
      });
      expect(levels.length).toBe(result.created);
      expect(levels.length).toBeGreaterThan(0);
    });
  });

  describe("runRegenerate service", () => {
    it("retires PRIOR active levels and creates fresh active ones", async () => {
      const sr = await makeLanguage("sr");
      await seedDictionary(sr);
      const old1 = await makeActiveLevel(sr, 1);
      const old2 = await makeActiveLevel(sr, 2);

      const result = await runRegenerate(prisma, {
        languageId: sr,
        script: "lat",
        mode: "basic",
        levelCount: 3,
        variationsPerLevel: 1,
        seed: 7,
      });

      expect(result.retired).toBe(2);
      expect(result.created).toBeGreaterThan(0);

      // Old ones are now retired.
      const oldRows = await prisma.level.findMany({
        where: { id: { in: [old1.id, old2.id] } },
      });
      expect(oldRows.every((l) => l.status === "retired")).toBe(true);

      // Fresh active ones exist, none of which are the old ids.
      const active = await prisma.level.findMany({
        where: { languageId: sr, script: "lat", mode: "basic", status: "active" },
      });
      expect(active.length).toBe(result.created);
      expect(active.some((l) => l.id === old1.id || l.id === old2.id)).toBe(false);
    });

    it("leaves a user's existing UserProgress untouched (still references the retired level)", async () => {
      const sr = await makeLanguage("sr");
      await seedDictionary(sr);
      const old = await makeActiveLevel(sr, 1);
      const user = await prisma.user.create({
        data: { authProvider: "anon", externalId: `dev-${Math.random()}` },
      });
      const progress = await prisma.userProgress.create({
        data: {
          userId: user.id,
          levelId: old.id,
          mode: "basic",
          stars: 3,
          score: 100,
          mistakes: 0,
          hintsUsed: 0,
        },
      });

      await runRegenerate(prisma, {
        languageId: sr,
        script: "lat",
        mode: "basic",
        levelCount: 2,
        variationsPerLevel: 1,
        seed: 42,
      });

      const stillThere = await prisma.userProgress.findUnique({
        where: { id: progress.id },
      });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.levelId).toBe(old.id); // still points at the now-retired level

      const oldLevel = await prisma.level.findUnique({ where: { id: old.id } });
      expect(oldLevel!.status).toBe("retired");
    });
  });
});
