/**
 * TEST-ONLY in-memory SqliteDb adapter backed by better-sqlite3 (Task 4.3).
 *
 * The native expo-sqlite binding cannot load in the jest-expo/Node test
 * environment, so we run the repos' REAL SQL against an in-memory better-sqlite3
 * database exposed through the same {@link SqliteDb} interface the production
 * code uses. This gives genuine behavioral coverage of the SQL (upsert,
 * best-result, getNextLevel ordering/exclusion, unique constraints) rather than
 * call-assertion mocks. Not shipped in the app bundle (only imported by tests).
 */

import Database from "better-sqlite3";

import { migrate } from "./schema";
import type { SqliteDb, SqliteRunResult } from "./sqlite";

/** Wrap a better-sqlite3 handle so it satisfies the async {@link SqliteDb} API. */
function adapt(raw: Database.Database): SqliteDb {
  return {
    async runAsync(source, params) {
      const info = raw.prepare(source).run(...(params as unknown[]));
      return {
        lastInsertRowId: Number(info.lastInsertRowid),
        changes: info.changes,
      } satisfies SqliteRunResult;
    },
    async getAllAsync<T>(source: string, params: readonly unknown[]) {
      return raw.prepare(source).all(...(params as unknown[])) as T[];
    },
    async getFirstAsync<T>(source: string, params: readonly unknown[]) {
      const row = raw.prepare(source).get(...(params as unknown[]));
      return (row ?? null) as T | null;
    },
  };
}

/** Open a fresh in-memory DB, run migrations, and return the SqliteDb view. */
export async function makeTestDb(): Promise<SqliteDb> {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");
  const db = adapt(raw);
  await migrate(db);
  return db;
}
