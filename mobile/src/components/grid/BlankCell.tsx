/**
 * A BLANK / unused filler cell — no content, no interaction.
 *
 * Rendered transparent so it blends into the board background, keeping the grid
 * a clean rectangle. Presentational; takes only its size.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

export type BlankCellProps = {
  row: number;
  col: number;
  /** Side length in px (square). */
  size: number;
};

function BlankCellImpl({ row, col, size }: BlankCellProps) {
  return (
    <View
      testID={`blank-${row}-${col}`}
      accessibilityLabel={`blank-${row}-${col}`}
      style={[styles.cell, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  cell: {
    backgroundColor: 'transparent',
  },
});

export const BlankCell = memo(BlankCellImpl);
