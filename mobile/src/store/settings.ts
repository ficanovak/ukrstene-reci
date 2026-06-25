/**
 * Persisted app settings store (Task 4.5).
 *
 * A tiny `zustand` store holding the three user-chosen preferences that the
 * whole app reacts to:
 *
 *  - `language` — the UI language (one of {@link LanguageCode}), or `null`
 *    until the user has made a first-launch choice. `null` is the signal the
 *    root layout uses to route to onboarding.
 *  - `script`   — Serbian Cyrillic vs Latin gameplay script. Only meaningful
 *    for `sr`; harmless otherwise. Defaults to Latin.
 *  - `themeMode` — light / dark / system (mirrors {@link ThemeMode}).
 *
 * Persistence uses `@react-native-async-storage/async-storage` via zustand's
 * `persist` middleware. Because AsyncStorage is async, the store exposes a
 * `hydrated` flag (set by the persist `onRehydrateStorage` callback) so the
 * root layout can wait for the saved values before deciding where to route —
 * otherwise a returning user would briefly flash the onboarding screen.
 *
 * This store is the single source of truth. The ThemeProvider's `mode` and the
 * i18n active language are SLAVED to it (wired in `src/app/_layout.tsx`): on
 * launch we apply the persisted language to i18n, and the ThemeProvider reads
 * `themeMode` as its mode. Setters here are the only place these change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LanguageCode } from '@/i18n';
import type { ThemeMode } from '@/theme';

/** Serbian gameplay script. Cyrillic or Latin. */
export type ScriptChoice = 'cyrillic' | 'latin';

export type SettingsState = {
  /** Chosen UI language, or `null` if the user hasn't picked one yet. */
  language: LanguageCode | null;
  /** Serbian gameplay script (Cyrillic/Latin). */
  script: ScriptChoice;
  /** Theme selection mode. */
  themeMode: ThemeMode;
  /** True once the persisted values have been read back from storage. */
  hydrated: boolean;

  setLanguage: (language: LanguageCode) => void;
  setScript: (script: ScriptChoice) => void;
  setThemeMode: (themeMode: ThemeMode) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: null,
      script: 'latin',
      themeMode: 'light',
      hydrated: false,

      setLanguage: (language) => set({ language }),
      setScript: (script) => set({ script }),
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: 'ukrstene.settings',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the user choices, never the transient `hydrated` flag.
      partialize: ({ language, script, themeMode }) => ({
        language,
        script,
        themeMode,
      }),
      onRehydrateStorage: () => () => {
        // Runs once the stored values (if any) have been merged in. Flip the
        // flag so the root layout knows it can trust `language` for routing.
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
