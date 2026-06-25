/**
 * A CLUE (definition) cell — the skandinavka hallmark.
 *
 * Renders either the clue TEXT (small, wrapped, centered) or an IMAGE, plus a
 * direction ARROW glyph indicating which way the answer reads:
 *   - dir 'across' → ▶ (pointing right)
 *   - dir 'down'   → ▼ (pointing down)
 *
 * Uses the theme `clueCell` background (a light blue-grey). All colors come from
 * `useTheme().colors`. Image clues use `expo-image`; when `imageRef` is missing
 * (common in tests / placeholder grids) a neutral box is shown so layout holds.
 *
 * Presentational: it takes the resolved `Clue` content + direction as props.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import type { Clue, Direction } from '@/game/gridData.types';
import { fontFamily, useTheme } from '@/theme';

/** Arrow glyphs per direction. Exported so tests assert on the exact glyph. */
export const ARROW_GLYPH: Record<Direction, string> = {
  across: '▶',
  down: '▼',
};

export type ClueCellProps = {
  row: number;
  col: number;
  clue: Clue;
  dir: Direction;
  /** Side length in px (square). */
  size: number;
  /** Optional tap handler (e.g. select the word this clue points to). */
  onPress?: (row: number, col: number) => void;
};

function ClueCellImpl({ row, col, clue, dir, size, onPress }: ClueCellProps) {
  const { colors } = useTheme();
  const arrow = ARROW_GLYPH[dir];

  // Text scales modestly with cell size; small by design (clues are terse).
  const fontSize = Math.max(7, Math.min(11, Math.round(size * 0.2)));
  const arrowSize = Math.max(9, Math.round(size * 0.26));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`clue-${row}-${col}`}
      testID={`clue-${row}-${col}`}
      onPress={onPress ? () => onPress(row, col) : undefined}
      style={[
        styles.cell,
        { width: size, height: size, backgroundColor: colors.clueCell },
      ]}
    >
      {clue.type === 'image' ? (
        clue.imageRef ? (
          <Image
            testID={`clue-image-${row}-${col}`}
            source={{ uri: clue.imageRef }}
            style={styles.image}
            contentFit="cover"
          />
        ) : (
          // Placeholder box when no image URL (tests / not-yet-loaded grids).
          <View
            testID={`clue-image-placeholder-${row}-${col}`}
            style={[styles.image, { backgroundColor: withAlpha(colors.text, 0.08) }]}
          />
        )
      ) : (
        <Text
          testID={`clue-text-${row}-${col}`}
          style={[styles.text, { color: colors.text, fontSize }]}
        >
          {clue.text ?? ''}
        </Text>
      )}

      <Text
        testID={`clue-arrow-${row}-${col}`}
        accessibilityLabel={`arrow-${dir}`}
        style={[styles.arrow, { color: colors.primary, fontSize: arrowSize }]}
      >
        {arrow}
      </Text>
    </Pressable>
  );
}

/** Appends an 8-bit alpha to a #RRGGBB hex color. */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    padding: 2,
    overflow: 'hidden',
  },
  text: {
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  // Arrow pinned bottom-right — the conventional skandinavka origin marker.
  arrow: {
    position: 'absolute',
    right: 2,
    bottom: 1,
    fontFamily: fontFamily.bold,
  },
});

export const ClueCell = memo(ClueCellImpl);
