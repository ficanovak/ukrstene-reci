/**
 * Backend API request/response types (Task 4.4), mirroring the Phase 3 routes.
 *
 * Shapes are intentionally kept in lockstep with the backend:
 *  - auth → `{ token, userId }`           (backend/src/routes/auth.ts)
 *  - levels/next → `{ levels: ApiLevel[] }` (backend/src/services/levels.ts → PlayableLevel)
 *  - progress → `{ levelId, mode, stars, score, mistakes, hintsUsed }` (backend/src/routes/progress.ts)
 *  - progress/batch → `{ ok, count }`
 *
 * Strings (not narrowed unions) are used for `mode`/`script` here so the client
 * stays decoupled from the backend enum source; the values that flow through
 * ('basic'|'advanced', 'lat'|'cyr') match what the backend validates.
 */

/** The signed-JWT payload returned by both auth endpoints. */
export interface AuthResponse {
  token: string;
  userId: string;
}

/** A playable level as returned by `GET /v1/levels/next` (backend PlayableLevel). */
export interface ApiLevel {
  id: string;
  mode: string;
  /** Server cuid for the language (NOT the lang CODE used in the query). */
  languageId: string;
  script: string;
  levelNumber: number;
  difficultyBand: number;
  gridWidth: number;
  gridHeight: number;
  /** The crossword payload (backend GridData); opaque to the client. */
  gridData: unknown;
}

/** `GET /v1/levels/next` response envelope. */
export interface NextLevelsResponse {
  levels: ApiLevel[];
}

/**
 * Query for `GET /v1/levels/next`. NOTE: `lang` is the language CODE
 * (sr/hr/bs/me/mk), which the backend resolves to a languageId. The returned
 * levels carry the resolved `languageId` (a cuid), not the code.
 */
export interface NextLevelsQuery {
  mode: string;
  /** Language CODE (sr/hr/...), resolved server-side to a languageId. */
  lang: string;
  script: string;
  count?: number;
}

/** A single completed-level result for `POST /v1/progress`. */
export interface ProgressInput {
  levelId: string;
  mode: string;
  stars: number;
  score: number;
  mistakes: number;
  hintsUsed: number;
}

/** `POST /v1/progress` response. */
export interface ProgressResponse {
  ok: boolean;
  progress?: unknown;
}

/** `POST /v1/progress/batch` response. */
export interface ProgressBatchResponse {
  ok: boolean;
  count: number;
}

/** Social auth providers the backend accepts. */
export type SocialProvider = "apple" | "google";
