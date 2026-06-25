import { render, screen, fireEvent } from '@testing-library/react-native';

import {
  createGameState,
  setActiveWord,
  setLetterAt,
} from '@/game/engine';
import type { GridData } from '@/game/gridData.types';
import { ThemeProvider } from '@/theme';

import { Grid } from './Grid';

/**
 * A compact 3×3 fixture exercising every cell kind:
 *
 *   row\col   0           1            2
 *   0       CLUE(across) LETTER(R,1)  LETTER(W,2)   ← word "across-1" = REC? no
 *   1       CLUE(down)   LETTER(E)    BLANK
 *   2       BLANK        LETTER(C)    BLANK
 *
 * - "across-1": cells (0,1),(0,2) solution R, E — clue at (0,0), dir across.
 * - "down-1":   cells (0,1),(1,1),(2,1) solution R, E, C — clue at (1,0), down.
 * Letter (0,1) is the shared crossing cell.
 */
function makeGrid(): GridData {
  return {
    width: 3,
    height: 3,
    cells: [
      { kind: 'clue', row: 0, col: 0, clueId: 'c-across', dir: 'across' },
      { kind: 'letter', row: 0, col: 1, solution: 'R', words: [
        { wordId: 'across-1', index: 0 },
        { wordId: 'down-1', index: 0 },
      ] },
      { kind: 'letter', row: 0, col: 2, solution: 'E', words: [{ wordId: 'across-1', index: 1 }] },
      { kind: 'clue', row: 1, col: 0, clueId: 'c-down', dir: 'down' },
      { kind: 'letter', row: 1, col: 1, solution: 'E', words: [{ wordId: 'down-1', index: 1 }] },
      { kind: 'blank', row: 1, col: 2 },
      { kind: 'blank', row: 2, col: 0 },
      { kind: 'letter', row: 2, col: 1, solution: 'C', words: [{ wordId: 'down-1', index: 2 }] },
      { kind: 'blank', row: 2, col: 2 },
    ],
    words: [
      {
        id: 'across-1',
        dir: 'across',
        cells: [{ row: 0, col: 1 }, { row: 0, col: 2 }],
        solution: ['R', 'E'],
        clueId: 'c-across',
        clueCell: { row: 0, col: 0 },
      },
      {
        id: 'down-1',
        dir: 'down',
        cells: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
        solution: ['R', 'E', 'C'],
        clueId: 'c-down',
        clueCell: { row: 1, col: 0 },
      },
    ],
    clues: {
      'c-across': { type: 'text', text: 'Capital of France?' },
      'c-down': { type: 'text', text: 'A musical note' },
    },
  };
}

function renderGrid(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('Grid', () => {
  it('renders the correct number of letter, clue and blank cells', async () => {
    const grid = makeGrid();
    const state = createGameState(grid);
    await renderGrid(<Grid grid={grid} state={state} maxWidth={300} />);

    expect(screen.getAllByTestId(/^cell-\d+-\d+$/)).toHaveLength(4); // letters
    expect(screen.getAllByTestId(/^clue-\d+-\d+$/)).toHaveLength(2); // clues
    expect(screen.getAllByTestId(/^blank-\d+-\d+$/)).toHaveLength(3); // blanks
  });

  it('renders clue text and the correct arrow per direction', async () => {
    const grid = makeGrid();
    const state = createGameState(grid);
    await renderGrid(<Grid grid={grid} state={state} maxWidth={300} />);

    expect(screen.getByTestId('clue-text-0-0')).toHaveTextContent('Capital of France?');
    expect(screen.getByTestId('clue-text-1-0')).toHaveTextContent('A musical note');
    // across → ▶ (right), down → ▼ (down)
    expect(screen.getByTestId('clue-arrow-0-0')).toHaveTextContent('▶');
    expect(screen.getByTestId('clue-arrow-1-0')).toHaveTextContent('▼');
  });

  it('shows the player entry from the engine, uppercased', async () => {
    const grid = makeGrid();
    // Player typed lowercase "r" at the crossing cell.
    const state = setLetterAt(createGameState(grid), 0, 1, 'r');
    await renderGrid(<Grid grid={grid} state={state} maxWidth={300} />);

    expect(screen.getByTestId('cell-text-0-1')).toHaveTextContent('R');
    // Untouched cell stays empty.
    expect(screen.getByTestId('cell-text-0-2')).toHaveTextContent('');
  });

  it('renders a digraph grapheme in a single cell', async () => {
    const grid = makeGrid();
    const state = setLetterAt(createGameState(grid), 0, 1, 'NJ');
    await renderGrid(<Grid grid={grid} state={state} maxWidth={300} />);
    expect(screen.getByTestId('cell-text-0-1')).toHaveTextContent('NJ');
  });

  it('marks active-word cells active and leaves others inactive', async () => {
    const grid = makeGrid();
    const state = setActiveWord(createGameState(grid), 'down-1');
    await renderGrid(<Grid grid={grid} state={state} maxWidth={300} />);

    // down-1 covers (0,1),(1,1),(2,1) — those have the active (2px) border.
    const active = screen.getByTestId('cell-0-1');
    const inactive = screen.getByTestId('cell-0-2'); // only in across-1
    const flatActive = flattenStyle(active.props.style);
    const flatInactive = flattenStyle(inactive.props.style);
    expect(flatActive.borderWidth).toBe(2);
    expect(flatInactive.borderWidth).not.toBe(2);
  });

  it('lets an explicit activeWordId override the engine state', async () => {
    const grid = makeGrid();
    const state = createGameState(grid); // no active word in state
    await renderGrid(
      <Grid grid={grid} state={state} activeWordId="across-1" maxWidth={300} />,
    );
    // across-1 covers (0,1),(0,2).
    expect(flattenStyle(screen.getByTestId('cell-0-2').props.style).borderWidth).toBe(2);
  });

  it('fires onCellPress with the cell coordinates', async () => {
    const grid = makeGrid();
    const state = createGameState(grid);
    const onCellPress = jest.fn();
    await renderGrid(
      <Grid grid={grid} state={state} maxWidth={300} onCellPress={onCellPress} />,
    );

    fireEvent.press(screen.getByTestId('cell-2-1'));
    expect(onCellPress).toHaveBeenCalledWith(2, 1);
  });

  it.each([6, 7, 8, 9])(
    'fits the available width without horizontal overflow (width %i)',
    async (w) => {
      const cells = Array.from({ length: w }, (_, col) => ({
        kind: 'blank' as const,
        row: 0,
        col,
      }));
      const grid: GridData = {
        width: w,
        height: 1,
        cells,
        words: [],
        clues: {},
      };
      await renderGrid(
        <Grid grid={grid} state={createGameState(grid)} maxWidth={393} />,
      );
      const flat = flattenStyle(screen.getByTestId('grid').props.style);
      expect(flat.width as number).toBeLessThanOrEqual(393);
    },
  );
});

/** Flattens a (possibly nested array) RN style prop into a single object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flattenStyle(s) }),
      {},
    );
  }
  return (style as Record<string, unknown>) ?? {};
}
