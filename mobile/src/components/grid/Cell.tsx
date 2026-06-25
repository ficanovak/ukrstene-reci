/**
 * A single LETTER cell of the crossword board.
 *
 * Presentational + prop-driven: it receives the grapheme to show, its
 * correctness state, and whether it's part of the active word — it holds no game
 * state of its own. The owning `Grid` derives these from the engine (`cellEntry`
 * / `checkCell`) and the active word.
 *
 * STATES (all colors from `useTheme().colors` — never hardcoded):
 * - empty            → neutral background (theme `background`), subtle border.
 * - filled           → shows the player's grapheme, uppercase.
 * - active highlight  → background tinted with the theme `primary` (the active
 *                      word). Applied regardless of fill state.
 * - correct / wrong  → ONLY surfaced when `showCheck` is true (auto-check mode):
 *                      correct → `correct` color, wrong → `wrong` (coral) text +
 *                      border. When `showCheck` is false the renderer never
 *                      reveals correctness (the screen owns that decision).
 *
 * A digraph grapheme (e.g. "NJ") is rendered as a single string inside ONE cell.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { fontFamily, useTheme } from '@/theme';

export type CellCheck = 'empty' | 'correct' | 'wrong';

export type CellProps = {
  row: number;
  col: number;
  /** Player's current grapheme, or null when empty. */
  entry: string | null;
  /** Engine correctness for this cell. */
  check: CellCheck;
  /** True when this cell belongs to the active word. */
  active: boolean;
  /** When true, surface correct/wrong coloring (auto-check on). */
  showCheck: boolean;
  /**
   * Advanced mode only: this cell is a CONFIRMED, immovable placement. It renders
   * with the success/"locked" look (green text + tint) regardless of `showCheck`,
   * so the player sees which letters are settled. Default false.
   */
  locked?: boolean;
  /** Side length in px (square). */
  size: number;
  /** Tap handler — the screen sets the active word / cursor. */
  onPress?: (row: number, col: number) => void;
};

function CellImpl({
  row,
  col,
  entry,
  check,
  active,
  showCheck,
  locked = false,
  size,
  onPress,
}: CellProps) {
  const { colors } = useTheme();

  const surfaceCheck = showCheck && check !== 'empty';
  const isWrong = surfaceCheck && check === 'wrong';
  // A locked (Advanced) cell always reads as confirmed/correct, even when
  // auto-check is off — it's a settled placement.
  const isCorrect = locked || (surfaceCheck && check === 'correct');

  // Background: a locked cell gets a soft green tint; the active word gets a teal
  // tint; otherwise the neutral surface. (`+ low opacity` reads as a tint.)
  const backgroundColor = locked
    ? withAlpha(colors.correct, 0.16)
    : active
      ? withAlpha(colors.primary, 0.18)
      : colors.background;

  const borderColor = isWrong
    ? colors.wrong
    : locked
      ? colors.correct
      : active
        ? colors.primary
        : hairline(colors.text);

  const textColor = isWrong
    ? colors.wrong
    : isCorrect
      ? colors.correct
      : colors.text;

  // Scale the glyph to the cell; cap so digraphs ("NJ") still fit.
  const fontSize = Math.max(12, Math.round(size * 0.46));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`cell-${row}-${col}`}
      accessibilityState={{ disabled: locked }}
      testID={`cell-${row}-${col}`}
      onPress={onPress ? () => onPress(row, col) : undefined}
      style={[
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor,
          borderColor,
          borderWidth: locked || active ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <Text
        testID={`cell-text-${row}-${col}`}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.text, { color: textColor, fontSize }]}
      >
        {entry ? entry.toUpperCase() : ''}
      </Text>
    </Pressable>
  );
}

/** Appends an 8-bit alpha to a #RRGGBB hex color (theme colors are hex). */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(clamp01(alpha) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

/** A faint border derived from the text color (low alpha). */
function hairline(textHex: string): string {
  return withAlpha(textHex, 0.16);
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  text: {
    fontFamily: fontFamily.bold,
    textAlign: 'center',
  },
});

export const Cell = memo(CellImpl);
