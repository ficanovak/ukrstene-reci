/**
 * Behavioral tests for the Basic mode screen (Task 5.4).
 *
 * These focus on the SCREEN WIRING — engine ↔ Grid ↔ Keyboard — not the engine
 * internals (those are unit-tested in engine.test.ts). We mock the level loader
 * (`useLevel`) so the screen synchronously renders the bundled sample level, and
 * mock `expo-router` so the back/next navigation is observable.
 *
 * NOTE on `await render(...)`: under RNTL 14 + RN's new architecture the initial
 * render must be awaited so the `screen` query API is populated; every test
 * therefore awaits `renderScreen()`.
 *
 * Sample level (see sampleLevel.ts):
 *   MORE (across) at row 1, cols 1..4  → M O R E
 *   OKO  (down)   from (1,2)           → O K O
 *   RAME (down)   from (1,3)           → R A M E
 *   Crossings: (1,2)=O [more∩oko], (1,3)=R [more∩rame].
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { sampleLevel } from '@/game/sampleLevel';
import { ThemeProvider } from '@/theme';

import { BasicGame } from './BasicGame';

// AsyncStorage (pulled in by the settings store) has no native module under
// Jest; use its official mock so the store hydrates in-memory.
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
    levelId: 'sample-basic-1',
    difficultyBand: 1,
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
      <BasicGame />
    </ThemeProvider>,
  );
}

/**
 * Press a node and flush the resulting state update. Under RN's new architecture
 * `setState` from an event handler schedules an act that must be awaited before
 * the rendered tree reflects it; `act(async …)` flushes it.
 */
async function press(node: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(node);
  });
}

/** Press the on-screen keyboard key for `grapheme`. */
async function pressKey(grapheme: string) {
  await press(screen.getByTestId(`key-${grapheme}`));
}

/** Tap the board letter cell at (row,col). */
async function tapCell(row: number, col: number) {
  await press(screen.getByTestId(`cell-${row}-${col}`));
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

/** True if cell (row,col) currently renders with the active (2px) border. */
function isActive(row: number, col: number): boolean {
  const flat = flattenStyle(screen.getByTestId(`cell-${row}-${col}`).props.style);
  return flat.borderWidth === 2;
}

/**
 * Activate `word`: tap its first cell, then (for a word whose first cell is an
 * intersection) toggle until a cell UNIQUE to the word is highlighted.
 */
async function activateWord(word: (typeof sampleLevel.words)[number]) {
  // A cell that belongs only to this word — the last cell is unique for all
  // three sample words (across/down legs don't re-cross at their tails).
  const unique = word.cells[word.cells.length - 1]!;
  const first = word.cells[0]!;
  await tapCell(first.row, first.col);
  if (!isActive(unique.row, unique.col)) {
    await tapCell(first.row, first.col); // toggle to this word
  }
}

/** Drive the engine to a fully-correct solution by activating + typing each word. */
async function solvePuzzle() {
  for (const word of sampleLevel.words) {
    await activateWord(word);
    for (const g of word.solution) await pressKey(g);
  }
}

beforeEach(() => {
  mockBack.mockClear();
  mockReplace.mockClear();
});

describe('BasicGame', () => {
  it('renders the board and the keyboard for the sample level', async () => {
    await renderScreen();
    expect(screen.getByTestId('grid')).toBeTruthy();
    expect(screen.getByTestId('keyboard')).toBeTruthy();
    // 9 letter cells in the sample (MORE 4 + OKO 2 extra + RAME 3 extra).
    expect(screen.getAllByTestId(/^cell-\d+-\d+$/)).toHaveLength(9);
  });

  it('tapping a word activates it and typing fills its cells', async () => {
    await renderScreen();
    // Tap the first MORE cell; type the whole word.
    await tapCell(1, 1);
    expect(isActive(1, 1)).toBe(true);

    await pressKey('M');
    await pressKey('O');
    await pressKey('R');
    await pressKey('E');

    expect(cellText(1, 1)).toBe('M');
    expect(cellText(1, 2)).toBe('O');
    expect(cellText(1, 3)).toBe('R');
    expect(cellText(1, 4)).toBe('E');
  });

  it('auto-check: a WRONG letter increments the mistake count; correct ones do not', async () => {
    await renderScreen();
    await tapCell(1, 1); // MORE, cursor at (1,1) whose solution is 'M'

    const mistakeText = () =>
      screen.getByTestId('stat-mistakes').props.children.join('');

    // Correct first letter → no mistake.
    await pressKey('M');
    expect(mistakeText()).toBe('Greške: 0');

    // Wrong second letter ('B' where solution is 'O') → one mistake.
    await pressKey('B');
    expect(mistakeText()).toBe('Greške: 1');
  });

  it('backspace clears the entered grapheme', async () => {
    await renderScreen();
    await tapCell(1, 1);
    await pressKey('M');
    expect(cellText(1, 1)).toBe('M');

    // setLetter advanced the cursor from (1,1) to (1,2). Backspace erases at the
    // cursor then steps back: first press clears the empty (1,2) & moves to
    // (1,1); second press clears (1,1).
    await press(screen.getByTestId('key-backspace'));
    await press(screen.getByTestId('key-backspace'));
    expect(cellText(1, 1)).toBe('');
  });

  it('direction toggle: tapping an intersection cell twice switches the active word', async () => {
    await renderScreen();
    // (1,2) belongs to both MORE (across) and OKO (down).
    // First tap → across default: the across-only cell (1,4) becomes active.
    await tapCell(1, 2);
    expect(isActive(1, 4)).toBe(true); // MORE active (across-only cell lit)
    expect(isActive(3, 2)).toBe(false); // OKO not active

    // Second tap on the SAME cell → toggle to OKO (down).
    await tapCell(1, 2);
    expect(isActive(3, 2)).toBe(true); // OKO active (down-only cell lit)
    expect(isActive(1, 4)).toBe(false); // MORE no longer active
  });

  it('word hint reveals the active word and disables after one use', async () => {
    await renderScreen();
    // Activate MORE then use the word hint.
    await tapCell(1, 1);
    const wordHint = screen.getByText('Pomoć: reč');
    await press(wordHint);

    // All MORE cells now show their solution.
    expect(cellText(1, 1)).toBe('M');
    expect(cellText(1, 2)).toBe('O');
    expect(cellText(1, 3)).toBe('R');
    expect(cellText(1, 4)).toBe('E');

    // The button is disabled (once per level): its Pressable is disabled.
    expect(screen.getByText('Pomoć: reč').parent?.props.accessibilityState?.disabled).toBe(true);
  });

  it('letter hint reveals the cursor cell and disables after one use', async () => {
    await renderScreen();
    await tapCell(1, 1); // cursor on (1,1), solution 'M'
    await press(screen.getByText('Pomoć: slovo'));
    expect(cellText(1, 1)).toBe('M');
    expect(
      screen.getByText('Pomoć: slovo').parent?.props.accessibilityState?.disabled,
    ).toBe(true);
  });

  it('hint buttons are disabled until a word is active', async () => {
    await renderScreen();
    // No active word yet → both hint buttons disabled.
    expect(screen.getByText('Pomoć: reč').parent?.props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByText('Pomoć: slovo').parent?.props.accessibilityState?.disabled).toBe(true);
  });

  it('solving the puzzle shows the Results overlay with a 5-star clean solve', async () => {
    await renderScreen();
    expect(screen.queryByTestId('results-overlay')).toBeNull();

    await solvePuzzle();

    const overlay = screen.getByTestId('results-overlay');
    expect(overlay).toBeTruthy();
    expect(within(overlay).getByText('Rešeno!')).toBeTruthy();
    // A clean solve (no mistakes, no hints) on the sample (band 1) → 5 stars.
    expect(within(overlay).queryAllByLabelText('star-filled')).toHaveLength(5);
    expect(within(overlay).queryAllByLabelText('star-empty')).toHaveLength(0);
    // Mistakes/hints rows are present and zero.
    expect(within(overlay).getByTestId('results-mistakes').props.children.join('')).toBe(
      'Greške: 0',
    );
  });
});
