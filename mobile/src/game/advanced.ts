/**
 * Advanced-mode letter-palette engine for "Ukrstene Reči" (Task 6.1).
 *
 * Layered ON TOP of the pure Basic engine (`engine.ts`). In Advanced mode the
 * player never types freely: the system DEALS up to 5 letters at a time, the
 * player PLACES each into a cell, taps SUBMIT; correct placements LOCK, wrong
 * ones are removed and counted as mistakes, and the palette REFILLS to 5 with
 * NEW letters until the whole board is solved (PRD §6.2 / §6.3).
 *
 * This module owns NO cell storage of its own — tentative placements live in the
 * base `GameState.fill` (written via `setLetterAt`). It adds three concepts:
 *   • PALETTE   — up to 5 graphemes currently available to place.
 *   • LOCKED    — set of cell keys confirmed correct & immovable.
 *   • mistakes  — counted per wrong placement at submit time.
 *
 * Everything is PURE/immutable and DETERMINISTIC given the seed.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RULES (the heart of Advanced mode — read before changing)
 * ─────────────────────────────────────────────────────────────────────────
 * DEALING (v1: ONLY real letters, NO decoys). The pool to deal from is the
 * multiset of solutions of all currently EMPTY, UNLOCKED letter cells — i.e. the
 * real graphemes still missing from the board ("needed"). A deal shuffles that
 * multiset with a seeded RNG and takes up to 5. A digraph (e.g. "NJ") is ONE
 * tile filling ONE cell. The palette size is `min(5, lettersStillNeeded)`, so
 * near the end fewer than 5 are dealt.
 *
 * PLACING. `placeLetter` tentatively writes a palette tile into an empty,
 * unlocked cell via the base engine. While placed, that tile is "used" and is
 * not offered again. `unplaceLetter` pulls it back; the player may also move it
 * (unplace then place elsewhere) before submitting. Locked cells reject writes.
 *
 * SUBMIT. For each tentatively-placed (non-locked) cell:
 *   • CORRECT (entry === solution) → LOCK the cell (immovable) and consume that
 *     tile permanently.
 *   • WRONG → clear the cell and count ONE mistake. The wrong tile is NOT
 *     returned to the palette.
 * After evaluating, REFILL: the palette is topped back up to `min(5, stillNeeded)`
 * with NEW letters drawn from the still-needed multiset. Wrong letters are never
 * recycled — fresh letters are dealt (PRD §6.2 step 4).
 *
 * CARRYOVER (unplaced palette letters at submit). Simple, deterministic rule:
 * any palette tile that was NOT placed and is STILL needed is KEPT (carried
 * over); tiles no longer needed are discarded. Then we top up to the cap with a
 * seeded draw from the remaining needed multiset (excluding tiles already kept).
 * This guarantees the palette only ever holds needed graphemes.
 *
 * MISTAKES. Counted ONLY here, once per wrong placement at submit (PRD §6.2).
 * The base engine also counts mistakes on `setLetterAt`, but the Advanced layer
 * IGNORES `base.mistakes` entirely and tracks its own — tentative placements
 * must not pollute the score before submit.
 *
 * TERMINATION. Every deal draws exclusively from letters that are actually
 * missing, so for a solvable board the player can always place ≥1 correct letter
 * each round; a submit that locks ≥1 cell strictly reduces the remaining count.
 * Therefore the solve loop makes monotone progress and terminates at `isSolved`.
 *
 * DETERMINISM. The state stores a numeric `seed` and a `dealCount`; each deal
 * derives a fresh `mulberry32(seed + dealCount)` generator. The state is fully
 * serializable (no live closures), so identical seed + identical actions ⇒
 * identical palettes.
 */

import {
  createGameState,
  setLetterAt,
  type GameState,
} from "./engine";
import type { GridData, LetterCell } from "./gridData.types";
import { mulberry32, shuffle } from "./rng";

/** Max tiles in the palette at once (PRD §6.2). */
export const PALETTE_SIZE = 5;

/** Coordinate key, identical scheme to the base engine. */
type CellKey = string;
function key(row: number, col: number): CellKey {
  return `${row},${col}`;
}

/** Immutable Advanced-mode state. Pure & serializable (no closures). */
export interface AdvancedState {
  /** The underlying Basic engine state (holds tentative placements in `fill`). */
  readonly base: GameState;
  /** Up to PALETTE_SIZE graphemes currently available to place. */
  readonly palette: readonly string[];
  /** Cell keys that are confirmed-correct and immovable. */
  readonly locked: ReadonlySet<CellKey>;
  /** Wrong placements counted at submit. */
  readonly mistakes: number;
  /** Seed for the deterministic deal RNG. */
  readonly seed: number;
  /** Number of deals performed so far (advances the deterministic RNG). */
  readonly dealCount: number;
}

/* ────────────────────────────── internal helpers ───────────────────────── */

/** All letter cells of the grid. */
function letterCells(grid: GridData): LetterCell[] {
  return grid.cells.filter((c): c is LetterCell => c.kind === "letter");
}

/**
 * Multiset of graphemes still NEEDED on the board: the solution of every letter
 * cell that is NOT locked and NOT currently holding a tentative placement.
 * (Tentatively-placed cells are excluded because their tile is already "in use"
 * off the palette; locked cells are done.)
 */
function neededGraphemes(state: AdvancedState): string[] {
  const out: string[] = [];
  for (const cell of letterCells(state.base.grid)) {
    const k = key(cell.row, cell.col);
    if (state.locked.has(k)) continue;
    if (state.base.fill[k] !== undefined) continue; // tentatively placed
    out.push(cell.solution);
  }
  return out;
}

/** Count of letter cells not yet locked (i.e. still to be solved). */
export function remainingCells(state: AdvancedState): number {
  let n = 0;
  for (const cell of letterCells(state.base.grid)) {
    if (!state.locked.has(key(cell.row, cell.col))) n += 1;
  }
  return n;
}

/** True iff every letter cell is locked (all solved). */
export function isSolved(state: AdvancedState): boolean {
  return remainingCells(state) === 0;
}

/**
 * Removes the first occurrence of `value` from `arr` (mutating). Returns true if
 * an element was removed. Used to draw without over-counting from a multiset.
 */
function removeFirst<T>(arr: T[], value: T): boolean {
  const i = arr.indexOf(value);
  if (i < 0) return false;
  arr.splice(i, 1);
  return true;
}

/**
 * Builds the refilled palette deterministically.
 *
 * @param keep   tiles to carry over (must be a subset of `needed` multiset).
 * @param needed the full still-needed multiset (INCLUDING the kept tiles).
 * @param seed   base seed.
 * @param dealCount which deal this is (advances the RNG deterministically).
 *
 * Keeps `keep`, then tops up to PALETTE_SIZE by a seeded shuffle of the leftover
 * needed graphemes (needed minus keep). Result length = min(5, needed.length).
 */
function deal(
  keep: readonly string[],
  needed: readonly string[],
  seed: number,
  dealCount: number,
): string[] {
  const leftover = needed.slice();
  // Remove the kept tiles from the leftover pool (don't deal them twice).
  for (const g of keep) removeFirst(leftover, g);

  const rng = mulberry32(seed + dealCount);
  const shuffled = shuffle(leftover, rng);

  const result = keep.slice();
  for (const g of shuffled) {
    if (result.length >= PALETTE_SIZE) break;
    result.push(g);
  }
  return result;
}

/* ────────────────────────────── constructor ────────────────────────────── */

/**
 * Creates a fresh Advanced state: empty base board, no locks, zero mistakes,
 * and the FIRST deal of up to 5 real needed letters (deterministic via `seed`).
 */
export function createAdvancedState(grid: GridData, seed: number): AdvancedState {
  const base = createGameState(grid);
  const proto: AdvancedState = {
    base,
    palette: [],
    locked: new Set(),
    mistakes: 0,
    seed,
    dealCount: 0,
  };
  const needed = neededGraphemes(proto);
  const palette = deal([], needed, seed, 0);
  return { ...proto, palette, dealCount: 1 };
}

/* ──────────────────────────── place / unplace ──────────────────────────── */

/**
 * Tentatively places the palette tile at `paletteIndex` into the (row, col)
 * cell. No-op (returns the same state) if:
 *   • the index is out of range,
 *   • the target is not a letter cell,
 *   • the target is locked, or
 *   • the target already holds a tentative placement.
 *
 * Writes through the base engine, then RESETS `base.mistakes` so tentative
 * placements never affect the Advanced score (mistakes are counted at submit).
 */
export function placeLetter(
  state: AdvancedState,
  paletteIndex: number,
  row: number,
  col: number,
): AdvancedState {
  if (paletteIndex < 0 || paletteIndex >= state.palette.length) return state;
  const k = key(row, col);
  if (state.locked.has(k)) return state;

  const cell = letterCells(state.base.grid).find(
    (c) => c.row === row && c.col === col,
  );
  if (!cell) return state; // not a letter cell
  if (state.base.fill[k] !== undefined) return state; // occupied

  const grapheme = state.palette[paletteIndex];
  const written = setLetterAt(state.base, row, col, grapheme);
  // Tentative placement must not move the Advanced score; ignore base mistakes.
  const base: GameState = { ...written, mistakes: 0 };

  const palette = state.palette.slice();
  palette.splice(paletteIndex, 1); // consume the tile from the palette

  return { ...state, base, palette };
}

/**
 * Pulls a tentatively-placed tile back from (row, col) to the palette. No-op if
 * the cell is locked or empty. The grapheme returns to the END of the palette.
 */
export function unplaceLetter(
  state: AdvancedState,
  row: number,
  col: number,
): AdvancedState {
  const k = key(row, col);
  if (state.locked.has(k)) return state;
  const grapheme = state.base.fill[k];
  if (grapheme === undefined) return state;

  const nextFill = { ...state.base.fill };
  delete nextFill[k];
  const base: GameState = { ...state.base, fill: nextFill };

  const palette = [...state.palette, grapheme];
  return { ...state, base, palette };
}

/* ───────────────────────────────── submit ──────────────────────────────── */

/**
 * Evaluates all tentative placements:
 *   • correct → lock the cell, consume the tile;
 *   • wrong   → clear the cell, +1 mistake (tile NOT returned).
 * Then refills the palette to min(5, stillNeeded) with NEW letters, carrying
 * over only unplaced tiles that are still needed (see CARRYOVER in the header).
 */
export function submit(state: AdvancedState): AdvancedState {
  const grid = state.base.grid;
  const fill = { ...state.base.fill };
  const locked = new Set(state.locked);
  let mistakes = state.mistakes;

  for (const cell of letterCells(grid)) {
    const k = key(cell.row, cell.col);
    if (locked.has(k)) continue;
    const entry = fill[k];
    if (entry === undefined) continue; // nothing placed here this round

    if (entry === cell.solution) {
      locked.add(k); // correct → lock; the tile is consumed permanently
    } else {
      delete fill[k]; // wrong → clear the cell
      mistakes += 1; // count one mistake per wrong placement
    }
  }

  const base: GameState = { ...state.base, fill, mistakes: 0 };

  const evaluated: AdvancedState = { ...state, base, locked, mistakes };

  // Refill. Carry over the palette tiles still unplaced & still needed.
  const needed = neededGraphemes(evaluated);
  const keep: string[] = [];
  const pool = needed.slice();
  for (const g of evaluated.palette) {
    if (removeFirst(pool, g)) keep.push(g); // still needed → carry over
    // else: tile no longer needed → discard
  }

  const palette = deal(keep, needed, state.seed, state.dealCount);
  return { ...evaluated, palette, dealCount: state.dealCount + 1 };
}
