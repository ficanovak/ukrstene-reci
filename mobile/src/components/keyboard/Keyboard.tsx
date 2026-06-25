/**
 * The in-game custom on-screen keyboard (Task 5.3).
 *
 * NOT the OS keyboard: it shows exactly the letters of the active language/script
 * (resolved by {@link getLayout}) so the player can only enter valid graphemes.
 * Each letter key emits ONE grapheme via `onKeyPress` — a digraph key (e.g. the
 * `NJ` key) emits the single grapheme `'NJ'`, which the engine drops into one
 * crossword cell. A distinct backspace control fires `onBackspace`.
 *
 * Used by Basic mode (Task 5.4). Advanced mode uses a letter palette instead, so
 * this component is intentionally Basic-focused.
 *
 * THEMING: all colors come from `useTheme().colors` (no hardcoded colors):
 *  - key surface  → a faint tint of `text` over the `background`.
 *  - key label    → `text`.
 *  - pressed key  → a `primary` tint (and primary border).
 *  - backspace    → same surface, with the `primary` accent on its glyph.
 *
 * LAYOUT: keys flex-wrap within each row and scale to share the available width
 * while honouring a touch-friendly minimum size. Digraph keys are a touch wider
 * (they hold 2–3 glyphs) but stay on the grid.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontFamily, useTheme } from '@/theme';
import type { LanguageCode } from '@/i18n';

import { getLayout, type Script } from './layouts';

/** Minimum touch target (px) for a key — keeps keys tappable on small phones. */
const MIN_KEY_SIZE = 34;

export type KeyboardProps = {
  /** Active content language (sr/hr/bs/me/mk). */
  language: LanguageCode;
  /** Active script. Only consulted for `sr`; fixed for the others. */
  script: Script;
  /** Fired with the single grapheme of the pressed letter key (e.g. 'NJ'). */
  onKeyPress: (grapheme: string) => void;
  /** Fired when the backspace control is pressed. */
  onBackspace: () => void;
};

/** Backspace glyph (⌫ — ERASE TO THE LEFT). Rendered, never emitted. */
const BACKSPACE_GLYPH = '⌫';

export function Keyboard({ language, script, onKeyPress, onBackspace }: KeyboardProps) {
  const { colors } = useTheme();
  const rows = getLayout(language, script);

  // Surface + pressed tints derived from theme tokens (no hardcoded colors).
  const surface = withAlpha(colors.text, 0.06);
  const surfaceBorder = withAlpha(colors.text, 0.16);
  const pressedSurface = withAlpha(colors.primary, 0.2);

  const renderKey = (grapheme: string) => {
    const isDigraph = grapheme.length > 1;
    return (
      <Pressable
        key={grapheme}
        testID={`key-${grapheme}`}
        accessibilityRole="button"
        accessibilityLabel={`key-${grapheme}`}
        onPress={() => onKeyPress(grapheme)}
        style={({ pressed }) => [
          styles.key,
          isDigraph && styles.keyWide,
          {
            backgroundColor: pressed ? pressedSurface : surface,
            borderColor: pressed ? colors.primary : surfaceBorder,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.keyLabel, { color: colors.text }]}
        >
          {grapheme}
        </Text>
      </Pressable>
    );
  };

  return (
    <View testID="keyboard" style={styles.container}>
      {rows.map((row, rowIndex) => (
        // eslint-disable-next-line react/no-array-index-key -- rows are stable & order-fixed
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map(renderKey)}
        </View>
      ))}
      <View style={styles.row}>
        <Pressable
          testID="key-backspace"
          accessibilityRole="button"
          accessibilityLabel="key-backspace"
          onPress={onBackspace}
          style={({ pressed }) => [
            styles.key,
            styles.keyWide,
            {
              backgroundColor: pressed ? pressedSurface : surface,
              borderColor: pressed ? colors.primary : surfaceBorder,
            },
          ]}
        >
          <Text style={[styles.keyLabel, { color: colors.primary }]}>{BACKSPACE_GLYPH}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Appends an 8-bit alpha to a #RRGGBB hex color (theme colors are hex). */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  key: {
    flexGrow: 1,
    flexBasis: MIN_KEY_SIZE,
    minWidth: MIN_KEY_SIZE,
    maxWidth: 64,
    height: MIN_KEY_SIZE + 10,
    margin: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  keyWide: {
    flexGrow: 1.6,
    flexBasis: MIN_KEY_SIZE * 1.4,
    maxWidth: 88,
  },
  keyLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    textAlign: 'center',
  },
});
