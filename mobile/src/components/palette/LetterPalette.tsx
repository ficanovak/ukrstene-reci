/**
 * The Advanced-mode letter palette (Task 6.2).
 *
 * A row of up to 5 amber {@link LetterTile}s plus a prominent teal "Submit"
 * pill — the visual analogue of the Crossword Challenge bottom bar, themed to
 * our palette (PRD §10). The player selects a tile, then taps a board cell to
 * place it (and taps a placed cell to return it); see the interaction model
 * below.
 *
 * PURELY PRESENTATIONAL / PROP-DRIVEN: this component owns NO placement state.
 * The Advanced screen (Task 6.3) holds the advanced engine and drives `letters`
 * + `selectedIndex`, handles board-cell taps via the Grid's `onCellPress`
 * (calling the engine's `placeLetter` / `unplaceLetter`), and decides
 * `submitDisabled`. The palette only emits tile selection + submit.
 *
 * INTERACTION MODEL (tap-to-place is the BASELINE — robust, accessible, tested):
 *   1. Tap a palette tile → `onSelectTile(index)` (the screen toggles
 *      `selectedIndex`; tapping the selected tile again deselects).
 *   2. Tap an empty board cell → screen places the selected tile (Grid level).
 *   3. Tap a tentatively-placed (unlocked) cell → screen returns it to the
 *      palette (Grid level).
 *   4. Tap "Submit" → `onSubmit()` (disabled while nothing is placed yet).
 *
 * DRAG/DROP is a DEFERRED enhancement for Task 6.3's polish: dragging a tile
 * onto a cell with react-native-gesture-handler + react-native-reanimated could
 * be layered on AS AN ADDITION without changing this API. It is intentionally
 * NOT added here because the jest suite has no reanimated/gesture-handler mock
 * wiring (no jest setup file; `transformIgnorePatterns` excludes them), and the
 * PRD's "prevlači/tapka" is already satisfied by tap. Adding it now would risk
 * destabilizing the green suite for a presentational component.
 *
 * THEMING: all colors come from `useTheme().colors` (no hardcoded colors). The
 * submit label is localized via i18n (`submit`), overridable through
 * `submitLabel`.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontFamily, useTheme } from '@/theme';

import { LetterTile } from './LetterTile';

/** Hard cap on how many tiles the palette shows (PRD: up to 5). */
const MAX_TILES = 5;

export type LetterPaletteProps = {
  /** Up to 5 graphemes to show as tiles (extra entries are ignored). */
  letters: string[];
  /** Index of the currently selected tile, or `null` if none is selected. */
  selectedIndex: number | null;
  /** Fired with the tapped tile's index (the screen toggles selection). */
  onSelectTile: (index: number) => void;
  /** Fired when the Submit pill is pressed (no-op while `submitDisabled`). */
  onSubmit: () => void;
  /** Disables Submit (e.g. when nothing has been placed yet). */
  submitDisabled?: boolean;
  /** Submit label override; defaults to the localized `submit` ("Potvrdi"). */
  submitLabel?: string;
};

export function LetterPalette({
  letters,
  selectedIndex,
  onSelectTile,
  onSubmit,
  submitDisabled = false,
  submitLabel,
}: LetterPaletteProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const visible = letters.slice(0, MAX_TILES);
  const label = submitLabel ?? t('submit');

  return (
    <View testID="letter-palette" style={styles.container}>
      <View style={styles.tiles}>
        {visible.map((grapheme, index) => (
          <LetterTile
            // Index identifies the palette slot; the screen maps it to a letter.
            // eslint-disable-next-line react/no-array-index-key -- slot position is the identity
            key={`palette-tile-${index}`}
            testID={`palette-tile-${index}`}
            grapheme={grapheme}
            selected={selectedIndex === index}
            onPress={() => onSelectTile(index)}
          />
        ))}
      </View>

      <Pressable
        testID="palette-submit"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: submitDisabled }}
        disabled={submitDisabled}
        onPress={onSubmit}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: colors.primary,
            opacity: submitDisabled ? 0.4 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.submitLabel, { color: colors.background }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 12,
  },
  // Prominent pill — full-width, generous touch target, rounded ends.
  submit: {
    alignSelf: 'stretch',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    lineHeight: 22,
    textAlign: 'center',
  },
});
