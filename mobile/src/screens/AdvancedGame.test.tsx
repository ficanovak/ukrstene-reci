/**
 * Behavioral tests for the Advanced mode screen (Task 6.3).
 *
 * These cover the SCREEN WIRING / FUNCTIONAL LOOP — advanced engine ↔ Grid ↔
 * LetterPalette — not the engine internals (unit-tested in advanced.test.ts) and
 * NOT the §6.4 animations (those are visual polish over the same engine state and
 * are deliberately animation-agnostic here: we assert the engine-driven DOM —
 * entries, locked, mistakes, solved — never animation internals).
 *
 * We mock the level loader (`useLevel`) so the screen synchronously renders the
 * bundled sample level, and mock `expo-router` so navigation is observable.
 *
 * Sample level (see sampleLevel.ts) — 9 letter cells:
 *   (1,1)M (1,2)O (1,3)R (1,4)E   (2,2)K (3,2)O   (2,3)A (3,3)M (4,3)E
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { sampleLevel } from '@/game/sampleLevel';
import type { LetterCell } from '@/game/gridData.types';
import { ThemeProvider } from '@/theme';

import { AdvancedGame } from './AdvancedGame';

// AsyncStorage (pulled in by the settings store) has no native module under Jest.
jest.mock(
  '@react-native-async-storage/async-storage',
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ── Mock the level loader → always the sample, ready immediately. ────────────
jest.mock('@/game/useLevel', () => ({
  useLevel: () => ({
    status: 'ready',
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    level: require('@/game/sampleLevel').sampleLevel,
    levelNumber: 1,
    source: 'sample',
  }),
  SAMPLE_LEVEL_ID: 'sample-basic-1',
}));

// ── Mock expo-router → observe navigation. ──────────────────────────────────
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: () => false,
    back: mockBack,
    replace: mockReplace,
  }),
}));

function renderScreen() {
  return render(
    <ThemeProvider>
      <AdvancedGame />
    </ThemeProvider>,
  );
}

/** Press a node and flush the resulting state update under RN's new architecture. */
async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}

/** Tap the board letter cell at (row,col). */
async function tapCell(row: number, col: number) {
  await press(screen.getByTestId(`cell-${row}-${col}`));
}

/** Tap palette tile by slot index. */
async function tapTile(index: number) {
  await press(screen.getByTestId(`palette-tile-${index}`));
}

/** The grapheme currently shown in cell (row,col), uppercased (or ''). */
function cellText(row: number, col: number): string {
  return screen.getByTestId(`cell-text-${row}-${col}`).props.children as string;
}

/** Flatten a (possibly nested) RN style prop into one object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flattenStyle(s) }),
      {},
    );
  }
  return (style as Record<string, unknown>) ?? {};
}

/** True if cell (row,col) currently renders as LOCKED (disabled accessibility). */
function isLocked(row: number, col: number): boolean {
  const node = screen.getByTestId(`cell-${row}-${col}`);
  return node.props.accessibilityState?.disabled === true;
}

/** Current palette graphemes, in slot order. */
function paletteLetters(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    const tile = screen.queryByTestId(`palette-tile-${i}`);
    if (!tile) break;
    // The tile renders its grapheme as text; read it off the tile subtree.
    out.push(within(tile).getByText(/.+/).props.children as string);
  }
  return out;
}

/** The mistake count shown in the top bar, as a number. */
function mistakeCount(): number {
  const children = screen.getByTestId('stat-mistakes').props.children as unknown[];
  const joined = children.join('');
  return Number(joined.replace(/\D+/g, ''));
}

/** All letter cells of the sample, with their solutions. */
const letterCells = sampleLevel.cells.filter(
  (c): c is LetterCell => c.kind === 'letter',
);

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
});

describe('AdvancedGame', () => {
  it('renders the board and the palette (≤5 tiles) for the sample level', async () => {
    await renderScreen();
    expect(screen.getByTestId('grid')).toBeTruthy();
    expect(screen.getByTestId('letter-palette')).toBeTruthy();
    // 9 letter cells in the sample.
    expect(screen.getAllByTestId(/^cell-\d+-\d+$/)).toHaveLength(9);
    // Palette deals up to 5 tiles.
    expect(paletteLetters().length).toBeGreaterThan(0);
    expect(paletteLetters().length).toBeLessThanOrEqual(5);
  });

  it('selecting a tile and tapping an empty cell shows that grapheme (tentative)', async () => {
    await renderScreen();
    const letters = paletteLetters();
    const grapheme = letters[0]!;
    // Find an empty letter cell whose solution is NOT this grapheme is fine —
    // tentative placement renders whatever was selected, regardless of correctness.
    const target = letterCells[0]!;

    await tapTile(0);
    await tapCell(target.row, target.col);

    expect(cellText(target.row, target.col)).toBe(grapheme.toUpperCase());
  });

  it('tapping a tentatively-placed cell returns the letter to the palette', async () => {
    await renderScreen();
    const before = paletteLetters();
    const grapheme = before[0]!;
    const target = letterCells[0]!;

    await tapTile(0);
    await tapCell(target.row, target.col);
    expect(cellText(target.row, target.col)).toBe(grapheme.toUpperCase());

    // Tap the placed cell → letter returns to the palette, cell clears.
    await tapCell(target.row, target.col);
    expect(cellText(target.row, target.col)).toBe('');
    expect(paletteLetters()).toContain(grapheme);
  });

  it('submitting a CORRECT placement locks the cell and refills the palette', async () => {
    await renderScreen();

    // Find a palette tile whose grapheme is the solution of some empty cell.
    const letters = paletteLetters();
    let placed: { row: number; col: number } | null = null;
    for (let i = 0; i < letters.length; i++) {
      const g = letters[i]!;
      const cell = letterCells.find((c) => c.solution === g);
      if (cell) {
        await tapTile(i);
        await tapCell(cell.row, cell.col);
        placed = { row: cell.row, col: cell.col };
        break;
      }
    }
    expect(placed).not.toBeNull();
    const { row, col } = placed!;

    expect(isLocked(row, col)).toBe(false);
    await press(screen.getByTestId('palette-submit'));

    // The correct placement is now locked + still shows its grapheme.
    expect(isLocked(row, col)).toBe(true);
    expect(cellText(row, col)).not.toBe('');
    // Locked cells ignore taps (can't be unplaced).
    await tapCell(row, col);
    expect(isLocked(row, col)).toBe(true);
    expect(cellText(row, col)).not.toBe('');
    // No mistakes from a correct submit.
    expect(mistakeCount()).toBe(0);
    // Palette refilled (still has tiles, since the board isn't solved).
    expect(paletteLetters().length).toBeGreaterThan(0);
  });

  it('submitting a WRONG placement clears the cell and increments mistakes', async () => {
    await renderScreen();
    const letters = paletteLetters();

    // Find a (tile, empty cell) pair where the tile is the WRONG grapheme.
    let placed: { row: number; col: number } | null = null;
    for (let i = 0; i < letters.length && !placed; i++) {
      const g = letters[i]!;
      const cell = letterCells.find((c) => c.solution !== g);
      if (cell) {
        await tapTile(i);
        await tapCell(cell.row, cell.col);
        placed = { row: cell.row, col: cell.col };
      }
    }
    expect(placed).not.toBeNull();
    const { row, col } = placed!;
    expect(cellText(row, col)).not.toBe('');
    expect(mistakeCount()).toBe(0);

    await press(screen.getByTestId('palette-submit'));

    // Wrong → cleared, not locked, mistakes incremented.
    expect(cellText(row, col)).toBe('');
    expect(isLocked(row, col)).toBe(false);
    expect(mistakeCount()).toBe(1);
  });

  it('driving the full solution (correct letters per round) shows the solved overlay', async () => {
    await renderScreen();
    expect(screen.queryByTestId('solved-overlay')).toBeNull();

    // Each round: for every still-empty/unlocked letter cell, if its needed
    // grapheme is in the palette, place it; then submit. Deals draw only from
    // needed letters, so each round locks ≥1 cell → the loop terminates.
    const maxRounds = letterCells.length + 5; // generous bound
    for (let round = 0; round < maxRounds; round++) {
      if (screen.queryByTestId('solved-overlay')) break;

      // Greedily place palette tiles into matching empty cells. Placing a tile
      // consumes it (palette shrinks + reindexes), so re-read the palette after
      // each placement and always act on the FIRST still-placeable tile.
      let placedThisRound = true;
      while (placedThisRound) {
        placedThisRound = false;
        const letters = paletteLetters();
        for (let i = 0; i < letters.length; i++) {
          const g = letters[i]!;
          const cell = letterCells.find(
            (c) =>
              c.solution === g &&
              !isLocked(c.row, c.col) &&
              cellText(c.row, c.col) === '',
          );
          if (!cell) continue;
          await tapTile(i);
          await tapCell(cell.row, cell.col);
          placedThisRound = true;
          break; // re-read palette (indices shifted)
        }
      }
      await press(screen.getByTestId('palette-submit'));
    }

    const overlay = screen.getByTestId('solved-overlay');
    expect(overlay).toBeTruthy();
    expect(screen.getByText('Rešeno!')).toBeTruthy();
    // Solved with no mistakes since we only ever placed correct letters.
    expect(within(overlay).getByText('Greške: 0')).toBeTruthy();
  });
});
