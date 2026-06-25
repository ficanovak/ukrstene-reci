/**
 * Typed HTTP client for the backend API (Task 4.4).
 *
 * A small `createApiClient({ baseUrl, getToken })` factory returns typed
 * functions wrapping each Phase 3 endpoint. The JWT is attached as
 * `Authorization: Bearer <token>` on protected routes; a non-2xx response throws
 * a typed {@link ApiError} (status + parsed body). Uses the global `fetch`
 * (provided by React Native / Jest).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * lang CODE vs languageId
 * ───────────────────────────────────────────────────────────────────────────
 * `getNextLevels` takes the language CODE (sr/hr/...) in its query — the backend
 * resolves it to a languageId. The returned {@link ApiLevel}s carry the resolved
 * `languageId` (a cuid), NOT the code. Callers that cache levels store that
 * `languageId`; callers that re-query pass the CODE again. See sync.ts.
 *
 * TOKEN SOURCE
 * Protected calls (`getNextLevels`, `submitProgress`, `submitProgressBatch`)
 * accept an explicit `token` arg; when omitted they fall back to the factory's
 * `getToken()`. Auth calls (`authAnon`, `authSocial`) are unauthenticated and
 * never attach a token. `baseUrl` is configurable (see config.ts).
 */

import { getApiBaseUrl } from "./config";

import type {
  AuthResponse,
  NextLevelsQuery,
  NextLevelsResponse,
  ProgressBatchResponse,
  ProgressInput,
  ProgressResponse,
  SocialProvider,
} from "./types";

/** Thrown on a non-2xx HTTP response; carries the status and parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface CreateApiClientOptions {
  /** Base origin of the backend (no trailing slash needed). Defaults to config. */
  baseUrl?: string;
  /** Optional default token provider for protected calls. */
  getToken?: () => string | undefined;
}

export interface ApiClient {
  authAnon(deviceId: string): Promise<AuthResponse>;
  authSocial(
    provider: SocialProvider,
    token: string,
    anonUserId?: string,
  ): Promise<AuthResponse>;
  getNextLevels(query: NextLevelsQuery, token?: string): Promise<NextLevelsResponse>;
  submitProgress(result: ProgressInput, token?: string): Promise<ProgressResponse>;
  submitProgressBatch(
    items: ProgressInput[],
    token?: string,
  ): Promise<ProgressBatchResponse>;
}

/** Parse a response body as JSON, falling back to text then null on failure. */
async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}

export function createApiClient(options: CreateApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/+$/, "");
  const defaultGetToken = options.getToken;

  /**
   * Core request helper: builds headers (JSON + optional Bearer), issues the
   * fetch, and throws {@link ApiError} on a non-2xx. Network failures from
   * `fetch` itself reject as-is (TypeError) for callers to handle.
   */
  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown; token?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (init.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (init.token) {
      headers.Authorization = `Bearer ${init.token}`;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    if (!res.ok) {
      throw new ApiError(res.status, await parseBody(res));
    }
    return (await res.json()) as T;
  }

  /** Resolve the effective token: explicit arg wins, else the factory default. */
  function resolveToken(token?: string): string | undefined {
    return token ?? defaultGetToken?.();
  }

  /** Build a `/v1/levels/next` query string, omitting an absent count. */
  function levelsQueryString(query: NextLevelsQuery): string {
    const params = new URLSearchParams({
      mode: query.mode,
      lang: query.lang,
      script: query.script,
    });
    if (query.count !== undefined) {
      params.set("count", String(query.count));
    }
    return params.toString();
  }

  return {
    authAnon(deviceId) {
      return request<AuthResponse>("/v1/auth/anon", {
        method: "POST",
        body: { deviceId },
      });
    },

    authSocial(provider, token, anonUserId) {
      const body: { provider: SocialProvider; token: string; anonUserId?: string } = {
        provider,
        token,
      };
      if (anonUserId !== undefined) {
        body.anonUserId = anonUserId;
      }
      return request<AuthResponse>("/v1/auth/social", { method: "POST", body });
    },

    getNextLevels(query, token) {
      return request<NextLevelsResponse>(`/v1/levels/next?${levelsQueryString(query)}`, {
        method: "GET",
        token: resolveToken(token),
      });
    },

    submitProgress(result, token) {
      return request<ProgressResponse>("/v1/progress", {
        method: "POST",
        body: result,
        token: resolveToken(token),
      });
    },

    submitProgressBatch(items, token) {
      return request<ProgressBatchResponse>("/v1/progress/batch", {
        method: "POST",
        body: { items },
        token: resolveToken(token),
      });
    },
  };
}
