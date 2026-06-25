/**
 * A single Advanced-mode letter tile (Task 6.2).
 *
 * One amber, touch-friendly square holding ONE grapheme — a digraph like 'NJ'
 * shows "NJ" in a single tile (mirroring the engine's one-grapheme-per-cell
 * model and the custom keyboard's digraph keys). Tapping the tile fires
 * `onPress`; the consuming palette/screen decides what selection means.
 *
 * INTERACTION: tap-to-place is the baseline (this is just the pressable source
 * tile). Drag/drop is a deferred enhancement (see LetterPalette docs) — this
 * component stays a plain `Pressable` so the jest suite needs no reanimated /
 * gesture-handler wiring.
 *
 * SELECTED STATE: encoded structurally via `accessibilityState.selected` (so the
 * screen + tests can assert highlight without poking at styles) AND shown
 * visually with a `primary` border + slight scale/elevation lift.
 *
 * THEMING: all colors come from `useTheme().colors` (no hardcoded colors):
 *  - surface     → `secondary` (amber) per PRD §10.
 *  - grapheme    → graphite `text` for contrast on amber (same in both themes).
 *  - selected    → `primary` (teal) border + elevation; pressed → subtle dim.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { fontFamily, useTheme } from '@/theme';

export type LetterTileProps = {
  /** The single grapheme to show (e.g. 'A' or the digraph 'NJ'). */
  grapheme: string;
  /** Whether this tile is the currently selected (highlighted) one. */
  selected: boolean;
  /** Fired when the tile is tapped. */
  onPress: () => void;
  /** Optional testID / accessibility label override. */
  testID?: string;
  /** Disables the tile (e.g. once its letter has been placed). */
  disabled?: boolean;
};

export function LetterTile({
  grapheme,
  selected,
  onPress,
  testID,
  disabled = false,
}: LetterTileProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`tile-${grapheme}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.secondary,
          borderColor: selected ? colors.primary : 'transparent',
          transform: [{ scale: selected ? 1.06 : 1 }],
          opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
        },
        selected && styles.selectedLift,
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.label, { color: colors.text }]}
      >
        {grapheme}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 3,
    margin: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lift the selected tile so the highlight reads on both themes.
  selectedLift: {
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    fontFamily: fontFamily.extraBold,
    fontSize: 22,
    textAlign: 'center',
  },
});
