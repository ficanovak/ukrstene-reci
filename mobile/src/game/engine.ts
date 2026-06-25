/**
 * Pure game-state engine for the "Ukrstene Reči" crossword.
 *
 * Shared by BOTH play modes (Basic = free typing; Advanced = letter palette).
 * No UI, no DB, no side effects: every function takes a `GameState` and returns
 * a NEW one (immutable, reducer-style). The Advanced layer (Task 6.1) composes
 * on top of these primitives (setLetterAt / checkCell / isSolved).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KEY MODELLING DECISIONS
 * ─────────────────────────────────────────────────────────────────────────
 * FILL KEYED BY CELL COORDINATE. The player's entries live in `fill`, a record
 * keyed by `"row,col"`. Intersections are therefore automatic: a cell shared by
 * an across and a down word holds ONE grapheme; writing it through either word
 * updates the single shared value, and reading it via either word agrees.
 *
 * GRAPHEMES, NOT CHARACTERS. Each fill is one grapheme STRING. A grapheme may be
 * a digraph like "NJ" that occupies a single cell. The engine never splits a
 * grapheme — the keyboard (Task 5.3) is responsible for emitting whole graphemes.
 *
 * CURSOR ADVANCE RULE. `setActiveWord` selects a word and resets the cursor to
 * index 0. The cursor walks the active word's `cells` in reading order.
 * `setLetter` writes the grapheme at the cursor cell, then advances the cursor
 * to the next cell. At the LAST cell the cursor CLAMPS (stays on the last index);
 * it does NOT wrap to the start and does NOT jump to another word. `clearLetter`
 * (backspace) clears the grapheme at the CURRENT cursor cell and does not move
 * the cursor (the screen decides whether to also step back).
 *
 * MISTAKE COUNTING RULE (PRD §5/§7, auto-check mode). `mistakes` counts each
 * wrong ENTRY, not wrong cells. A mistake is counted when a player places a
 * grapheme into a cell whose solution it does NOT match — EXCEPT we never
 * double-count placing the SAME wrong value into a cell that already holds that
 * exact wrong value (a no-op re-entry). Concretely, a mistake increments iff:
 *   (a) the new grapheme != the cell's solution, AND
 *   (b) the new grapheme != the cell's CURRENT entry.
 * So: wrong then same-wrong = 1; wrong then different-wrong = 2; wrong then
 * correct then wrong-again = 2. Correct entries never increment.
 */

import type { GridData, LetterCell, Word } from "./gridData.types";

/** Coordinate key for the fill map and the letter-cell index. */
function key(row: number, col: number): string {
  return `${row},${col}`;
}

/** Immutable player game state. */
export interface GameState {
  /** The grid being played (read-only reference). */
  readonly grid: GridData;
  /** Player-entered graphemes, keyed by `"row,col"`. Absent key === empty cell. */
  readonly fill: Readonly<Record<string, string>>;
  /** The currently selected word's id, or null if none selected. */
  readonly activeWordId: string | null;
  /** Cursor position as an index into the active word's `cells`. */
  readonly cursorIndex: number;
  /** Running count of wrong entries (see mistake rule in the module docstring). */
  readonly mistakes: number;
}

/** Argument to `moveCursor`: an absolute index (number) or a relative delta. */
export type CursorMove = number | { delta: number };

/* ────────────────────────────── internal lookups ───────────────────────── */

/** Index every letter cell by coordinate key for O(1) solution lookup. */
function indexLetterCells(grid: GridData): Map<string, LetterCell> {
  const m = new Map<string, LetterCell>();
  for (const cell of grid.cells) {
    if (cell.kind === "letter") m.set(key(cell.row, cell.col), cell);
  }
  return m;
}

function findWord(grid: GridData, wordId: string): Word | undefined {
  return grid.words.find((w) => w.id === wordId);
}

function activeWord(state: GameState): Word | undefined {
  return state.activeWordId === null
    ? undefined
    : findWord(state.grid, state.activeWordId);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/* ────────────────────────────── constructors ───────────────────────────── */

/** Creates a fresh game state: all letter cells empty, no active word. */
export function createGameState(grid: GridData): GameState {
  return {
    grid,
    fill: {},
    activeWordId: null,
    cursorIndex: 0,
    mistakes: 0,
  };
}

/* ──────────────────────────── active word + cursor ─────────────────────── */

/** Selects a word and resets the cursor to its first cell (index 0). */
export function setActiveWord(state: GameState, wordId: string): GameState {
  const word = findWord(state.grid, wordId);
  if (!word) return state;
  return { ...state, activeWordId: wordId, cursorIndex: 0 };
}

/**
 * Moves the cursor within the active word, clamped to `[0, len-1]`.
 * Pass a number for an absolute index, or `{ delta }` for a relative move.
 * No-op if there is no active word.
 */
export function moveCursor(state: GameState, move: CursorMove): GameState {
  const word = activeWord(state);
  if (!word) return state;
  const last = word.cells.length - 1;
  const target =
    typeof move === "number" ? move : state.cursorIndex + move.delta;
  const cursorIndex = clamp(target, 0, last);
  if (cursorIndex === state.cursorIndex) return state;
  return { ...state, cursorIndex };
}

/* ─────────────────────────────── writing fills ─────────────────────────── */

/**
 * Core writer: places `grapheme` at (row, col) if it is a letter cell, applying
 * the mistake-counting rule. Returns a new state. Returns the input unchanged if
 * the coordinate is not a letter cell.
 */
function writeAt(
  state: GameState,
  row: number,
  col: number,
  grapheme: string,
): GameState {
  const cells = indexLetterCells(state.grid);
  const cell = cells.get(key(row, col));
  if (!cell) return state; // not a letter cell — ignore.

  const k = key(row, col);
  const prev = state.fill[k];
  const isWrong = grapheme !== cell.solution;
  // Count a mistake only for a NEW wrong value (don't double-count re-entering
  // the identical wrong grapheme into an already-wrong cell).
  const countsMistake = isWrong && grapheme !== prev;

  return {
    ...state,
    fill: { ...state.fill, [k]: grapheme },
    mistakes: countsMistake ? state.mistakes + 1 : state.mistakes,
  };
}

/**
 * Writes a grapheme at the active word's cursor cell, then advances the cursor
 * to the next cell (clamped at the last index — see module docstring). No-op if
 * there is no active word.
 */
export function setLetter(state: GameState, grapheme: string): GameState {
  const word = activeWord(state);
  if (!word) return state;
  const coord = word.cells[state.cursorIndex];
  if (!coord) return state;
  const written = writeAt(state, coord.row, coord.col, grapheme);
  const last = word.cells.length - 1;
  const cursorIndex = clamp(state.cursorIndex + 1, 0, last);
  return { ...written, cursorIndex };
}

/**
 * Writes a grapheme directly at (row, col) — useful for tap-to-fill and the
 * Advanced palette layer. Does NOT touch the cursor or active word.
 */
export function setLetterAt(
  state: GameState,
  row: number,
  col: number,
  grapheme: string,
): GameState {
  return writeAt(state, row, col, grapheme);
}

/**
 * Backspace: clears the grapheme at the active word's CURRENT cursor cell.
 * Does not move the cursor. No-op if there is no active word or the cell is
 * already empty.
 */
export function clearLetter(state: GameState): GameState {
  const word = activeWord(state);
  if (!word) return state;
  const coord = word.cells[state.cursorIndex];
  if (!coord) return state;
  const k = key(coord.row, coord.col);
  if (!(k in state.fill)) return state;
  const nextFill = { ...state.fill };
  delete nextFill[k];
  return { ...state, fill: nextFill };
}

/* ───────────────────────────────── reads ───────────────────────────────── */

/** The player's current grapheme at a cell, or null if empty / not a letter cell. */
export function cellEntry(
  state: GameState,
  row: number,
  col: number,
): string | null {
  const entry = state.fill[key(row, col)];
  return entry === undefined ? null : entry;
}

/** Per-cell correctness: 'empty' (no entry), 'correct', or 'wrong'. */
export function checkCell(
  state: GameState,
  row: number,
  col: number,
): "empty" | "correct" | "wrong" {
  const cells = indexLetterCells(state.grid);
  const cell = cells.get(key(row, col));
  if (!cell) return "empty"; // non-letter cells are never "wrong".
  const entry = state.fill[key(row, col)];
  if (entry === undefined) return "empty";
  return entry === cell.solution ? "correct" : "wrong";
}

/** True iff EVERY letter cell's entry equals its solution. */
export function isSolved(state: GameState): boolean {
  for (const cell of state.grid.cells) {
    if (cell.kind !== "letter") continue;
    if (state.fill[key(cell.row, cell.col)] !== cell.solution) return false;
  }
  return true;
}
