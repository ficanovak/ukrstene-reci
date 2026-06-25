/**
 * API client tests (Task 4.4): the typed HTTP client wrapping the backend.
 *
 * `global.fetch` is mocked (RN/Jest provide it globally), so these assert the
 * URL / method / headers (Bearer token) each function builds, and that the JSON
 * body is parsed back. A non-2xx response must throw a typed {@link ApiError}
 * carrying the status + parsed body — no real network involved.
 */

import { ApiError, createApiClient } from "./client";

const BASE = "http://test.local";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

/** Pull the [url, init] of the most recent fetch call. */
function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const h = init.headers as Record<string, string> | undefined;
  return h?.[name];
}

describe("createApiClient", () => {
  it("authAnon posts deviceId and returns { token, userId }", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "jwt-1", userId: "u1" }));
    const api = createApiClient({ baseUrl: BASE });

    const res = await api.authAnon("device-abc");

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/v1/auth/anon`);
    expect(init.method).toBe("POST");
    expect(headerValue(init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ deviceId: "device-abc" });
    expect(res).toEqual({ token: "jwt-1", userId: "u1" });
  });

  it("authAnon does NOT attach an Authorization header (unauthenticated)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "t", userId: "u" }));
    const api = createApiClient({ baseUrl: BASE, getToken: () => "should-not-be-used" });

    await api.authAnon("device-abc");

    expect(headerValue(lastCall().init, "Authorization")).toBeUndefined();
  });

  it("authSocial posts provider/token (+ optional anonUserId)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "jwt-2", userId: "u2" }));
    const api = createApiClient({ baseUrl: BASE });

    const res = await api.authSocial("google", "id-token-xyz", "anon-1");

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/v1/auth/social`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      provider: "google",
      token: "id-token-xyz",
      anonUserId: "anon-1",
    });
    expect(res).toEqual({ token: "jwt-2", userId: "u2" });
  });

  it("authSocial omits anonUserId when not provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "t", userId: "u" }));
    const api = createApiClient({ baseUrl: BASE });

    await api.authSocial("apple", "tok");

    expect(JSON.parse(lastCall().init.body as string)).toEqual({
      provider: "apple",
      token: "tok",
    });
  });

  it("getNextLevels GETs the right query string with a Bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ levels: [{ id: "lvl-1" }] }));
    const api = createApiClient({ baseUrl: BASE });

    const res = await api.getNextLevels(
      { mode: "basic", lang: "sr", script: "lat", count: 10 },
      "jwt-token",
    );

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/v1/levels/next?mode=basic&lang=sr&script=lat&count=10`);
    expect(init.method ?? "GET").toBe("GET");
    expect(headerValue(init, "Authorization")).toBe("Bearer jwt-token");
    expect(res).toEqual({ levels: [{ id: "lvl-1" }] });
  });

  it("getNextLevels omits count from the query when not provided", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ levels: [] }));
    const api = createApiClient({ baseUrl: BASE });

    await api.getNextLevels({ mode: "advanced", lang: "hr", script: "cyr" }, "t");

    expect(lastCall().url).toBe(`${BASE}/v1/levels/next?mode=advanced&lang=hr&script=cyr`);
  });

  it("getNextLevels uses the client's getToken when no explicit token passed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ levels: [] }));
    const api = createApiClient({ baseUrl: BASE, getToken: () => "from-provider" });

    await api.getNextLevels({ mode: "basic", lang: "sr", script: "lat" });

    expect(headerValue(lastCall().init, "Authorization")).toBe("Bearer from-provider");
  });

  it("submitProgress POSTs the result with a Bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    const api = createApiClient({ baseUrl: BASE });
    const result = { levelId: "lvl-1", mode: "basic", stars: 5, score: 100, mistakes: 0, hintsUsed: 1 };

    const res = await api.submitProgress(result, "jwt-token");

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/v1/progress`);
    expect(init.method).toBe("POST");
    expect(headerValue(init, "Authorization")).toBe("Bearer jwt-token");
    expect(JSON.parse(init.body as string)).toEqual(result);
    expect(res).toEqual({ ok: true });
  });

  it("submitProgressBatch POSTs items and returns { ok, count }", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, count: 2 }));
    const api = createApiClient({ baseUrl: BASE });
    const items = [
      { levelId: "a", mode: "basic", stars: 3, score: 10, mistakes: 0, hintsUsed: 0 },
      { levelId: "b", mode: "basic", stars: 4, score: 20, mistakes: 1, hintsUsed: 2 },
    ];

    const res = await api.submitProgressBatch(items, "jwt-token");

    const { url, init } = lastCall();
    expect(url).toBe(`${BASE}/v1/progress/batch`);
    expect(init.method).toBe("POST");
    expect(headerValue(init, "Authorization")).toBe("Bearer jwt-token");
    expect(JSON.parse(init.body as string)).toEqual({ items });
    expect(res).toEqual({ ok: true, count: 2 });
  });

  it("trims a trailing slash on baseUrl so paths don't double up", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ token: "t", userId: "u" }));
    const api = createApiClient({ baseUrl: `${BASE}/` });

    await api.authAnon("d");

    expect(lastCall().url).toBe(`${BASE}/v1/auth/anon`);
  });

  describe("error handling", () => {
    it("throws ApiError with the status + parsed body on a non-2xx response", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "invalid body" }, 400));
      const api = createApiClient({ baseUrl: BASE });

      await expect(api.authAnon("d")).rejects.toBeInstanceOf(ApiError);
      try {
        await api.authAnon("d");
      } catch (err) {
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.body).toEqual({ error: "invalid body" });
      }
    });

    it("ApiError on a 401 carries status 401", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
      const api = createApiClient({ baseUrl: BASE });

      await expect(
        api.getNextLevels({ mode: "basic", lang: "sr", script: "lat" }, "bad"),
      ).rejects.toMatchObject({ status: 401 });
    });

    it("a non-JSON error body still throws ApiError (body falls back to text/null)", async () => {
      const res = {
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
        text: async () => "Internal Server Error",
      } as unknown as Response;
      fetchMock.mockResolvedValue(res);
      const api = createApiClient({ baseUrl: BASE });

      await expect(api.authAnon("d")).rejects.toMatchObject({ status: 500 });
    });

    it("propagates a network (fetch) rejection as-is (not an ApiError)", async () => {
      fetchMock.mockRejectedValue(new TypeError("Network request failed"));
      const api = createApiClient({ baseUrl: BASE });

      await expect(api.authAnon("d")).rejects.toBeInstanceOf(TypeError);
    });
  });
});
