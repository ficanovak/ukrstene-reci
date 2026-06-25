import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

import type { FastifyInstance } from "fastify";

// Pure HTTP test: uses Fastify's `inject` so no port is bound and no real
// network I/O happens. The health route touches no database, keeping this fast
// and DB-independent.
describe("GET /v1/health", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with { status: 'ok' }", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for an unknown route (Fastify default)", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/nope" });

    expect(response.statusCode).toBe(404);
  });
});
