/**
 * `useLevel` — the Basic-mode level loader hook (Task 5.4).
 *
 * RESPONSIBILITY
 * ───────────────────────────────────────────────────────────────────────────
 * Resolve the `GridData` the screen should play, from the LOCAL level cache
 * (SQLite, Task 4.3) with a bundled FALLBACK so the screen is playable in
 * dev/offline before any backend sync has run.
 *
 * STRATEGY (cache → fallback):
 *   1. Open the DB singleton and ask `levelRepo.getNextLevel(scope)` for the
 *      lowest uncompleted cached level for this mode/language/script.
 *   2. If a cached level exists, play its `gridData`.
 *   3. If the cache is empty (returns null) OR the DB can't be opened (e.g. the
 *      native sqlite binding is unavailable in a dev/test context), fall back to
 *      the bundled {@link sampleLevel}. This is the dev/offline path — it lets
 *      Basic mode render WITHOUT a backend.
 *
 * The hook returns a small state machine the screen renders against:
 *   `{ status: 'loading' }` → `{ status: 'ready', level, levelNumber, source }`.
 * (There is intentionally no hard error state: a failure degrades to the sample
 * fallback rather than blocking play — the puzzle is never empty.)
 *
 * SCOPE: `mode` is fixed to `'basic'` here (this hook backs the Basic screen).
 * Language/script come from the settings store; we map the store's
 * `ScriptChoice` ('latin'|'cyrillic') onto the cache's `script` column values
 * ('lat'|'cyr') the same way the rest of the app does.
 */
import { useEffect, useState } from 'react';

import { getNextLevel, type LevelScope } from '@/db/levelRepo';
import { getDb } from '@/db/sqlite';
import type { SqliteDb } from '@/db/sqlite';
import type { LanguageCode } from '@/i18n';
import { FALLBACK_LANGUAGE } from '@/i18n';
import type { ScriptChoice } from '@/store/settings';

import type { GridData } from './gridData.types';
import { SAMPLE_LEVEL_ID, sampleLevel } from './sampleLevel';

/** Where the resolved level came from — useful for the UI + debugging. */
export type LevelSource = 'cache' | 'sample';

export type LevelLoadState =
  | { status: 'loading' }
  | {
      status: 'ready';
      /** The grid to play. */
      level: GridData;
      /** Display level number (cache level number, or 1 for the sample). */
      levelNumber: number;
      /** Whether this came from the cache or the bundled sample fallback. */
      source: LevelSource;
    };

export type UseLevelArgs = {
  /** UI/content language; defaults to the i18n fallback when null. */
  language: LanguageCode | null;
  /** Serbian gameplay script choice from settings. */
  script: ScriptChoice;
};

/** Map the settings `ScriptChoice` onto the cache's stored script value. */
function scriptColumn(script: ScriptChoice): string {
  return script === 'cyrillic' ? 'cyr' : 'lat';
}

/** The bundled fallback as a ready state (level number 1). */
function sampleState(): LevelLoadState {
  return {
    status: 'ready',
    level: sampleLevel,
    levelNumber: 1,
    source: 'sample',
  };
}

/**
 * Resolve the next Basic-mode level. Injectable seams (`openDb`,
 * `fetchNextLevel`) keep the hook unit-testable without the native sqlite
 * binding — production uses the real `getDb` / `getNextLevel`.
 */
export function useLevel(
  { language, script }: UseLevelArgs,
  deps: {
    openDb?: () => Promise<SqliteDb>;
    fetchNextLevel?: typeof getNextLevel;
  } = {},
): LevelLoadState {
  // The injectable seams default to the real DB. They're read off `deps` inside
  // the effect so the effect's dep array stays the stable, value-typed inputs
  // (language/script) — a new `deps` object each render must NOT reload.
  const { openDb: openDbDep, fetchNextLevel: fetchDep } = deps;

  const [state, setState] = useState<LevelLoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    // `getDb` returns the concrete `SQLiteDatabase`, which structurally
    // satisfies `SqliteDb` (its bind-param overload is wider); the cast mirrors
    // sqlite.ts.
    const openDb: () => Promise<SqliteDb> =
      openDbDep ?? (() => getDb() as unknown as Promise<SqliteDb>);
    const fetchNextLevel = fetchDep ?? getNextLevel;

    async function load() {
      const scope: LevelScope = {
        mode: 'basic',
        languageId: language ?? FALLBACK_LANGUAGE,
        script: scriptColumn(script),
      };

      try {
        const db = await openDb();
        const next = await fetchNextLevel(db, scope);
        if (cancelled) return;
        if (next && isGridData(next.gridData)) {
          setState({
            status: 'ready',
            level: next.gridData,
            levelNumber: next.levelNumber,
            source: 'cache',
          });
          return;
        }
        // Cache empty (or unusable payload) → bundled fallback.
        setState(sampleState());
      } catch {
        // DB unavailable (e.g. no native binding in dev) → bundled fallback.
        if (!cancelled) setState(sampleState());
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [language, script, openDbDep, fetchDep]);

  return state;
}

/** Minimal structural guard that a cached payload looks like a `GridData`. */
function isGridData(value: unknown): value is GridData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.width === 'number' &&
    typeof v.height === 'number' &&
    Array.isArray(v.cells) &&
    Array.isArray(v.words)
  );
}

export { SAMPLE_LEVEL_ID };
