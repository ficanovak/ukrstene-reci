import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, truncateAll } from "../../test/prisma.js";
import { buildApp } from "../app.js";

import type { SocialVerifier } from "../services/socialVerify.js";
import type { FastifyInstance } from "fastify";

/**
 * Integration tests for the auth routes (Task 3.2).
 *
 * They run against the TEST database (injected test prisma client) and a MOCK
 * social-token verifier, so no real Apple/Google network calls happen. The app
 * is driven via `app.inject(...)` — no port is bound.
 */

// A mock verifier whose behaviour each test controls. By default it returns a
// fixed apple identity; tests override `impl` to simulate google / failures.
function makeMockVerifier(): {
  verifier: SocialVerifier;
  setImpl: (fn: SocialVerifier["verify"]) => void;
} {
  let impl: SocialVerifier["verify"] = async (provider, token) => ({
    provider,
    externalId: `ext-${token}`,
    email: `${token}@example.com`,
  });
  return {
    verifier: { verify: (provider, token) => impl(provider, token) },
    setImpl: (fn) => {
      impl = fn;
    },
  };
}

// Minimal real Language + Level rows so UserProgress FK constraints are valid.
async function seedLevels(): Promise<{ levelA: string; levelB: string }> {
  const language = await prisma.language.create({
    data: { code: "sr", name: "Srpski", supportedScripts: ["lat"] },
  });
  const baseLevel = {
    languageId: language.id,
    script: "lat",
    difficultyCoefficient: 1,
    difficultyBand: 1,
    variationGroup: 1,
    gridWidth: 5,
    gridHeight: 5,
    gridData: {},
    status: "active" as const,
  };
  const levelA = await prisma.level.create({
    data: { ...baseLevel, mode: "basic", levelNumber: 1 },
  });
  const levelB = await prisma.level.create({
    data: { ...baseLevel, mode: "basic", levelNumber: 2 },
  });
  return { levelA: levelA.id, levelB: levelB.id };
}

describe("auth routes", () => {
  let app: FastifyInstance;
  let mock: ReturnType<typeof makeMockVerifier>;

  beforeEach(async () => {
    await truncateAll();
    mock = makeMockVerifier();
    app = buildApp({ prisma, socialVerifier: mock.verifier });
    await app.ready();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /v1/auth/anon", () => {
    it("creates an anon user and returns a token + userId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/anon",
        payload: { deviceId: "device-1" },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.token).toBe("string");
      expect(typeof body.userId).toBe("string");

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: body.userId },
      });
      expect(user.authProvider).toBe("anon");
      expect(user.externalId).toBe("device-1");
    });

    it("is find-or-create: same deviceId returns the same userId", async () => {
      const first = await app.inject({
        method: "POST",
        url: "/v1/auth/anon",
        payload: { deviceId: "device-dup" },
      });
      const second = await app.inject({
        method: "POST",
        url: "/v1/auth/anon",
        payload: { deviceId: "device-dup" },
      });

      expect(first.json().userId).toBe(second.json().userId);
      const count = await prisma.user.count({
        where: { authProvider: "anon", externalId: "device-dup" },
      });
      expect(count).toBe(1);
    });

    it("returns a JWT carrying sub === userId", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/anon",
        payload: { deviceId: "device-jwt" },
      });
      const { token, userId } = res.json();

      const decoded = app.jwt.verify<{ sub: string }>(token);
      expect(decoded.sub).toBe(userId);
    });

    it("rejects a missing deviceId with 400", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/anon",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /v1/auth/social", () => {
    it("creates a social user and returns a token; repeat returns same user", async () => {
      const first = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "apple", token: "appletok" },
      });

      expect(first.statusCode).toBe(200);
      const body = first.json();
      expect(typeof body.token).toBe("string");

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: body.userId },
      });
      expect(user.authProvider).toBe("apple");
      expect(user.externalId).toBe("ext-appletok");

      const second = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "apple", token: "appletok" },
      });
      expect(second.json().userId).toBe(body.userId);
      expect(
        await prisma.user.count({ where: { authProvider: "apple" } }),
      ).toBe(1);
    });

    it("returns 401 when the verifier rejects the token", async () => {
      mock.setImpl(async () => {
        throw new Error("invalid token");
      });
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "google", token: "bad" },
      });
      expect(res.statusCode).toBe(401);
    });

    it("migrates anon progress onto the social user", async () => {
      const { levelA, levelB } = await seedLevels();
      const anon = await prisma.user.create({
        data: { authProvider: "anon", externalId: "anon-mig" },
      });
      await prisma.userProgress.createMany({
        data: [
          {
            userId: anon.id,
            levelId: levelA,
            mode: "basic",
            stars: 3,
            score: 100,
            mistakes: 1,
            hintsUsed: 0,
          },
          {
            userId: anon.id,
            levelId: levelB,
            mode: "basic",
            stars: 2,
            score: 50,
            mistakes: 2,
            hintsUsed: 1,
          },
        ],
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "apple", token: "social1", anonUserId: anon.id },
      });
      expect(res.statusCode).toBe(200);
      const socialUserId = res.json().userId;

      const socialProgress = await prisma.userProgress.findMany({
        where: { userId: socialUserId },
      });
      expect(socialProgress).toHaveLength(2);

      const anonProgress = await prisma.userProgress.count({
        where: { userId: anon.id },
      });
      expect(anonProgress).toBe(0);
    });

    it("resolves conflicts by keeping the better (higher-stars) result", async () => {
      const { levelA } = await seedLevels();

      // Create the social user first (via social auth) and give it 3-star
      // progress on levelA/basic.
      const socialRes = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "apple", token: "conflict" },
      });
      const socialUserId = socialRes.json().userId;
      await prisma.userProgress.create({
        data: {
          userId: socialUserId,
          levelId: levelA,
          mode: "basic",
          stars: 3,
          score: 100,
          mistakes: 0,
          hintsUsed: 0,
        },
      });

      // Anon user has a BETTER 5-star result for the same (levelA, basic).
      const anon = await prisma.user.create({
        data: { authProvider: "anon", externalId: "anon-conflict" },
      });
      await prisma.userProgress.create({
        data: {
          userId: anon.id,
          levelId: levelA,
          mode: "basic",
          stars: 5,
          score: 80,
          mistakes: 0,
          hintsUsed: 0,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "apple", token: "conflict", anonUserId: anon.id },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().userId).toBe(socialUserId);

      const rows = await prisma.userProgress.findMany({
        where: { userId: socialUserId, levelId: levelA, mode: "basic" },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].stars).toBe(5);
    });

    it("is idempotent: a nonexistent anonUserId just logs in the social user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: {
          provider: "google",
          token: "idem",
          anonUserId: "does-not-exist",
        },
      });
      expect(res.statusCode).toBe(200);
      expect(typeof res.json().userId).toBe("string");
    });

    it("migrates anon prefs only when the social user has none set", async () => {
      const { levelA } = await seedLevels();
      const language = await prisma.level.findUniqueOrThrow({
        where: { id: levelA },
      });

      const anon = await prisma.user.create({
        data: {
          authProvider: "anon",
          externalId: "anon-prefs",
          currentLanguageId: language.languageId,
          currentScript: "lat",
          theme: "dark",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/v1/auth/social",
        payload: { provider: "apple", token: "prefs", anonUserId: anon.id },
      });
      const socialUserId = res.json().userId;

      const social = await prisma.user.findUniqueOrThrow({
        where: { id: socialUserId },
      });
      expect(social.currentScript).toBe("lat");
      expect(social.theme).toBe("dark");
    });
  });

  describe("app.authenticate decorator", () => {
    it("is exposed for protected routes (tasks 3.3/3.4)", () => {
      expect(typeof app.authenticate).toBe("function");
    });
  });
});
