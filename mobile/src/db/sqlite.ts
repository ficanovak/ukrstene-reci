/**
 * SQLite bootstrap for the mobile client (Task 4.3).
 *
 * Opens the local database with the MODERN async expo-sqlite API
 * (`openDatabaseAsync`), runs migrations, and caches the handle as a singleton
 * so the whole app shares one connection.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * THIN DB INTERFACE (`SqliteDb`) — why the repos don't import expo-sqlite
 * ───────────────────────────────────────────────────────────────────────────
 * The repositories (levelRepo / progressRepo) and `migrate` take a `SqliteDb`
 * rather than a concrete `SQLiteDatabase`. `SqliteDb` is the minimal subset of
 * the expo-sqlite async API the repos actually use (`runAsync`, `getAllAsync`,
 * `getFirstAsync`). expo-sqlite's `SQLiteDatabase` structurally satisfies it
 * (see `getDb()` below), so production passes the real DB. TESTS pass a
 * better-sqlite3-backed adapter implementing the SAME interface — so the repo
 * tests exercise REAL SQL (upsert / best-result / ordering), not mocks, in a
 * plain Node/Jest environment where the native expo-sqlite binding cannot load.
 * The shared-type extraction (and any node-vs-native shims) is a future task.
 */

import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { migrate } from "./schema";

/** Result of a write statement (mirrors expo-sqlite's `SQLiteRunResult`). */
export interface SqliteRunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Minimal async SQLite surface the repos depend on. A structural subset of
 * expo-sqlite's `SQLiteDatabase`; bind params are passed as a single array
 * (the array-form overload both expo-sqlite and the test adapter support).
 */
export interface SqliteDb {
  runAsync(source: string, params: readonly unknown[]): Promise<SqliteRunResult>;
  getAllAsync<T>(source: string, params: readonly unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: readonly unknown[]): Promise<T | null>;
}

const DB_NAME = "ukrstene.db";

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Open + migrate the database, returning a cached singleton. Concurrent callers
 * share the same in-flight promise, so the DB is opened/migrated exactly once.
 */
export function getDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME).then(async (db) => {
      // `SQLiteDatabase` structurally satisfies `SqliteDb` (its runAsync accepts
      // an array of bind params), so it can drive migrate() directly.
      await migrate(db as unknown as SqliteDb);
      return db;
    });
  }
  return dbPromise;
}

/**
 * Reset the cached handle. TEST-ONLY escape hatch (not used in app code); kept
 * here so a test that swaps the underlying DB doesn't leak a stale singleton.
 */
export function resetDbForTests(): void {
  dbPromise = null;
}
