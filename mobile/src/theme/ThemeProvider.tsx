import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ThemeColors } from './colors';

/**
 * Theme selection mode:
 * - `'light'`  — force the light "Topla enigmatika" palette (DEFAULT; the PRD
 *                makes light the primary theme, dark is opt-in).
 * - `'dark'`   — force the dark "Tamna tema" palette.
 * - `'system'` — follow the OS color scheme (resolved via `useColorScheme`).
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/** The resolved theme — what `'system'` collapses to (never `'system'`). */
export type ResolvedTheme = 'light' | 'dark';

export type ThemeContextValue = {
  /** The active palette. Read this in components: `const { colors } = useTheme()`. */
  colors: ThemeColors;
  /** The current selection mode (may be `'system'`). */
  mode: ThemeMode;
  /** The concrete theme actually in effect (`'light'` | `'dark'`). */
  resolvedTheme: ResolvedTheme;
  /** Change the selection mode. */
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const PALETTES: Record<ResolvedTheme, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
};

export type ThemeProviderProps = {
  children: ReactNode;
  /** Initial mode. Defaults to `'light'` per the PRD. */
  initialMode?: ThemeMode;
};

export function ThemeProvider({
  children,
  initialMode = 'light',
}: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    // Resolve 'system' to a concrete theme; fall back to light when the OS
    // reports no preference (null / 'unspecified').
    const resolvedTheme: ResolvedTheme =
      mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

    return {
      colors: PALETTES[resolvedTheme],
      mode,
      resolvedTheme,
      setMode,
    };
  }, [mode, systemScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access the active theme. Must be used inside a `<ThemeProvider>`.
 *
 *   const { colors } = useTheme();
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error('useTheme must be used within a <ThemeProvider>');
  }
  return ctx;
}
