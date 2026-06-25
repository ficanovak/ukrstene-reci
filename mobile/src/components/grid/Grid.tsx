/**
 * The crossword board renderer — the visual skandinavka grid.
 *
 * PRESENTATIONAL + PROP-DRIVEN. The Grid owns NO game state. It takes the static
 * `GridData` (the board) plus the engine's `GameState` and derives, per cell,
 * what to draw via the engine reads (`cellEntry`, `checkCell`). Both play modes
 * (Basic / Advanced) reuse it unchanged — only the wiring of `onCellPress`,
 * `activeWordId` and `showCheck` differs.
 *
 * AUTO-SIZE TO FIT WIDTH (PRD §4.3). The cell side is computed by the pure
 * `computeCellSize` (see ./sizing.ts): `floor(availableWidth / width)`, so the
 * board NEVER needs horizontal scrolling for widths 6–9. `availableWidth`
 * defaults to the window width (via `useWindowDimensions`) but can be overridden
 * with `maxWidth` (e.g. when the screen has horizontal padding). `maxHeight`, if
 * given, additionally clamps so a short board also fits vertically.
 *
 * LAYOUT. Cells are absolutely positioned at `col*size, row*size` inside a fixed
 * `width*size × height*size` board. This is robust and exact (no flex rounding),
 * and lets every cell be a memoized leaf.
 *
 * ACTIVE-WORD HIGHLIGHT. The cells of `activeWordId` (looked up in
 * `grid.words`) render with the active tint/border (see Cell).
 */
import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  cellEntry,
  checkCell,
  type GameState,
} from '@/game/engine';
import type { GridData } from '@/game/gridData.types';

import { BlankCell } from './BlankCell';
import { Cell } from './Cell';
import { ClueCell } from './ClueCell';
import { computeCellSize } from './sizing';

export type GridProps = {
  /** The board to render. */
  grid: GridData;
  /** The engine game state (entries, correctness). */
  state: GameState;
  /**
   * The active word's id. Its letter cells get the highlight. Defaults to the
   * state's own `activeWordId` when omitted, so callers can either drive it
   * explicitly or let it follow the engine.
   */
  activeWordId?: string | null;
  /** Surface correct/wrong coloring (auto-check mode). Default false. */
  showCheck?: boolean;
  /** Override the available width (px). Defaults to the window width. */
  maxWidth?: number;
  /** Optional available height (px) to also clamp vertical fit. */
  maxHeight?: number;
  /** Tap a letter cell — the screen sets the active word / cursor. */
  onCellPress?: (row: number, col: number) => void;
  /** Tap a clue cell (optional — e.g. select that clue's word). */
  onCluePress?: (row: number, col: number) => void;
};

function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

export function Grid({
  grid,
  state,
  activeWordId,
  showCheck = false,
  maxWidth,
  maxHeight,
  onCellPress,
  onCluePress,
}: GridProps) {
  const { width: windowWidth } = useWindowDimensions();
  const availableWidth = maxWidth ?? windowWidth;

  const cellSize = computeCellSize(
    availableWidth,
    grid.width,
    grid.height,
    maxHeight,
  );

  // Resolve the active word once: a Set of "row,col" keys for O(1) lookup.
  const resolvedActiveId =
    activeWordId !== undefined ? activeWordId : state.activeWordId;

  const activeCells = useMemo(() => {
    const set = new Set<string>();
    if (resolvedActiveId == null) return set;
    const word = grid.words.find((w) => w.id === resolvedActiveId);
    if (word) {
      for (const c of word.cells) set.add(coordKey(c.row, c.col));
    }
    return set;
  }, [grid.words, resolvedActiveId]);

  const boardWidth = cellSize * grid.width;
  const boardHeight = cellSize * grid.height;

  return (
    <View
      testID="grid"
      accessibilityLabel="crossword-grid"
      style={[styles.board, { width: boardWidth, height: boardHeight }]}
    >
      {grid.cells.map((cell) => {
        const { row, col } = cell;
        const left = col * cellSize;
        const top = row * cellSize;
        const positioned = { position: 'absolute' as const, left, top };

        if (cell.kind === 'letter') {
          return (
            <View key={coordKey(row, col)} style={positioned}>
              <Cell
                row={row}
                col={col}
                size={cellSize}
                entry={cellEntry(state, row, col)}
                check={checkCell(state, row, col)}
                active={activeCells.has(coordKey(row, col))}
                showCheck={showCheck}
                onPress={onCellPress}
              />
            </View>
          );
        }

        if (cell.kind === 'clue') {
          const clue = grid.clues[cell.clueId];
          // Skip gracefully if a clue id is dangling (shouldn't happen for valid
          // grids); render a blank so layout stays intact.
          if (!clue) {
            return (
              <View key={coordKey(row, col)} style={positioned}>
                <BlankCell row={row} col={col} size={cellSize} />
              </View>
            );
          }
          return (
            <View key={coordKey(row, col)} style={positioned}>
              <ClueCell
                row={row}
                col={col}
                size={cellSize}
                clue={clue}
                dir={cell.dir}
                onPress={onCluePress}
              />
            </View>
          );
        }

        // blank
        return (
          <View key={coordKey(row, col)} style={positioned}>
            <BlankCell row={row} col={col} size={cellSize} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    position: 'relative',
  },
});
