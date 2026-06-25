import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

import type { FastifyInstance } from "fastify";

/**
 * App-factory hardening tests:
 *  - C1: the JWT secret must FAIL CLOSED in production — booting prod with the
 *    public dev fallback (or no secret) must throw at startup, so nobody can
 *    forge a token for any `sub`. Dev/test keep the zero-config fallback.
 *  - M1: the generic error handler masks true 5xx as `{ error: 'internal' }`
 *    (no leaked internal message) while passing explicit 4xx through.
 */

describe("buildApp JWT secret fail-closed (C1)", () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

  afterEach(() => {
    // Restore env so later tests/files (which rely on the dev fallback) are
    // unaffected.
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  it("throws in production when JWT_SECRET is unset", () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    expect(() => buildApp()).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET equals the insecure dev fallback", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "dev-insecure-jwt-secret-change-me";
    expect(() => buildApp()).toThrow(/JWT_SECRET/);
  });

  it("does NOT throw in production when a real JWT_SECRET is set", () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "a-real-high-entropy-production-secret-value";
    expect(() => buildApp()).not.toThrow();
  });

  it("does NOT throw outside production even without a JWT_SECRET (dev/test fallback)", () => {
    process.env.NODE_ENV = "test";
    delete process.env.JWT_SECRET;
    expect(() => buildApp()).not.toThrow();
  });
});

describe("generic error handler (M1)", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("masks an unhandled throw as a generic 500 without leaking the message", async () => {
    app = buildApp();
    app.get("/v1/boom", async () => {
      throw new Error("super secret internal detail");
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/v1/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: "internal" });
    // The internal message must NOT be echoed to the client.
    expect(res.body).not.toContain("super secret internal detail");
  });

  it("passes a thrown 4xx error through with its message", async () => {
    app = buildApp();
    app.get("/v1/teapot", async () => {
      const err = new Error("i am a teapot") as Error & { statusCode: number };
      err.statusCode = 418;
      throw err;
    });
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/v1/teapot" });
    expect(res.statusCode).toBe(418);
    expect(res.json()).toEqual({ error: "i am a teapot" });
  });
});
