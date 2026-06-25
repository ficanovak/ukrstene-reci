/**
 * Hint system for "Ukrstene Reči" (Task 7.2).
 *
 * Per PRD §7.2 each level grants exactly TWO hints — one reveals the active
 * WORD (fills all its cells with the correct solution), one reveals a single
 * LETTER (fills one cell). Each is usable ONCE per level; using one flags it for
 * scoring via `hintsUsed`, which feeds `scoreLevel({ hintsUsed })` (Task 7.1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PROVIDER ISOLATION (the key architectural requirement)
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE hints come from is abstracted behind {@link HintProvider}. v1 ships
 * {@link freePerLevelProvider} which grants `{ word: 1, letter: 1 }` per level
 * ("2 free per level", not stockpiled). A future `inventoryProvider` (drawing
 * from a stored balance / rewarding an ad) implements the same one-method
 * interface and drops in WITHOUT changing any gameplay caller: the screens and
 * the apply* operations only ever see a {@link HintState}, never the source.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SHARED REVEAL LOGIC, PER-MODE APPLICATION
 * ─────────────────────────────────────────────────────────────────────────
 * Both engines share ONE base `GameState` whose `fill` holds graphemes keyed by
 * "row,col" (see engine.ts). The reveal LOGIC is therefore shared: write the
 * cell's correct `solution` grapheme into the base GameState. Application
 * differs only in what each mode does AFTERWARDS:
 *   • Basic: the written grapheme simply becomes the player's (now correct)
 *     entry — it renders as a normal correct cell. We intentionally do NOT lock
 *     it in Basic (Basic has no lock concept); the player may still re-type over
 *     it, but since it is already correct that is a no-op for solving. This keeps
 *     hints.ts free of Basic-specific lock machinery.
 *   • Advanced: after revealing, the screen also LOCKS the revealed cells (like a
 *     submit success) via {@link lockRevealed}, so they become immovable and
 *     count as solved. `lockRevealed` also strips any stale palette/fill noise by
 *     trusting the revealed base GameState as the new authoritative `base`.
 *
 * To keep mistake-counting honest, the reveal writes through a path that does
 * NOT increment `mistakes` (a hint is never a "mistake"): we set the fill
 * directly rather than via `setLetterAt`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LETTER-HINT TARGET SELECTION (decided by the CALLER)
 * ─────────────────────────────────────────────────────────────────────────
 * `applyLetterHint(game, hints, row, col)` reveals exactly the (row,col) passed
 * in — hints.ts does not pick the target. The screens choose it per mode:
 *   • Basic: the cursor cell of the active word.
 *   • Advanced: the first still-unsolved (empty, unlocked) cell of the active
 *     word, or — if no active word — the first empty unlocked cell on the board.
 * Both choices are documented at the call sites. Centralising the policy in the
 * screens keeps the engine-agnostic logic here tiny and pure.
 */
import {
  cellEntry,
  type GameState,
} from "./engine";
import type { AdvancedState } from "./advanced";
import type { Coord, GridData, LetterCell } from "./gridData.types";

/* ─────────────────────────────── provider ──────────────────────────────── */

/** How many hints of each type a single level is granted. */
export interface HintBudget {
  /** Word-reveal hints available this level (v1: 1). */
  word: number;
  /** Letter-reveal hints available this level (v1: 1). */
  letter: number;
}

/**
 * Abstracts WHERE hints come from. `grant()` is called once per level (by
 * {@link createHintState}) and returns the budget for that level. v1 returns a
 * fixed free allowance; a future inventory/ads provider can return budget drawn
 * from a stored balance or an earned reward — same interface, no caller change.
 */
export interface HintProvider {
  grant(): HintBudget;
}

/** v1 provider: "2 free per level" — exactly one word + one letter hint. */
export function freePerLevelProvider(): HintProvider {
  return {
    grant: () => ({ word: 1, letter: 1 }),
  };
}

/* ───────────────────────────────── state ───────────────────────────────── */

/**
 * Per-level hint state. `*Remaining` flags whether each hint type can still be
 * used; `hintsUsed` is the running total for scoring (Task 7.1). Immutable —
 * apply* operations return a NEW state.
 */
export interface HintState {
  readonly wordRemaining: boolean;
  readonly letterRemaining: boolean;
  readonly hintsUsed: number;
}

/**
 * Initialises hint state for a level from a provider's budget. A hint type is
 * "remaining" iff the provider granted at least one of it (so a provider giving
 * 0 word hints disables the word hint from the start — proving the source drives
 * availability).
 */
export function createHintState(provider: HintProvider): HintState {
  const budget = provider.grant();
  return {
    wordRemaining: budget.word > 0,
    letterRemaining: budget.letter > 0,
    hintsUsed: 0,
  };
}

/** Result of an apply* operation: the (possibly unchanged) game + hint state. */
export interface HintApplyResult {
  game: GameState;
  hints: HintState;
}

/* ─────────────────────────── internal reveal core ──────────────────────── */

/** Index letter cells by "row,col" for O(1) solution lookup. */
function letterCellAt(
  grid: GridData,
  row: number,
  col: number,
): LetterCell | undefined {
  return grid.cells.find(
    (c): c is LetterCell => c.kind === "letter" && c.row === row && c.col === col,
  );
}

/**
 * Writes the correct solution grapheme into (row, col) of the base GameState,
 * WITHOUT touching `mistakes` (a reveal is never a mistake) and without moving
 * the cursor/active word. Returns the input unchanged if it is not a letter cell
 * or already holds the correct grapheme.
 */
function reveal(state: GameState, row: number, col: number): GameState {
  const cell = letterCellAt(state.grid, row, col);
  if (!cell) return state;
  const k = `${row},${col}`;
  if (cellEntry(state, row, col) === cell.solution) return state; // already correct
  return { ...state, fill: { ...state.fill, [k]: cell.solution } };
}

/* ────────────────────────────── operations ─────────────────────────────── */

/**
 * Word hint: reveal the ACTIVE word — fill ALL its letter cells with their
 * correct solution graphemes. `wordId` is the currently active word's id (the
 * caller passes `state.activeWordId`); a null id is a no-op.
 *
 * Guard: usable once per level. If `wordRemaining` is false, or there is no
 * active word, returns the input unchanged (rejected). On success, fills the
 * cells, sets `wordRemaining` false, and bumps `hintsUsed`.
 */
export function applyWordHint(
  state: GameState,
  hints: HintState,
  wordId: string | null,
): HintApplyResult {
  if (!hints.wordRemaining || wordId === null) {
    return { game: state, hints };
  }
  const word = state.grid.words.find((w) => w.id === wordId);
  if (!word) return { game: state, hints };

  let game = state;
  for (const coord of word.cells) {
    game = reveal(game, coord.row, coord.col);
  }
  return {
    game,
    hints: {
      ...hints,
      wordRemaining: false,
      hintsUsed: hints.hintsUsed + 1,
    },
  };
}

/**
 * Letter hint: reveal ONE cell — the (row, col) chosen by the caller (see the
 * module header for the per-mode target policy). Fills it with its correct
 * grapheme.
 *
 * Guard: usable once per level. If `letterRemaining` is false, or (row,col) is
 * not a letter cell, returns the input unchanged. On success, fills the cell,
 * sets `letterRemaining` false, and bumps `hintsUsed`.
 */
export function applyLetterHint(
  state: GameState,
  hints: HintState,
  row: number,
  col: number,
): HintApplyResult {
  if (!hints.letterRemaining) return { game: state, hints };
  if (!letterCellAt(state.grid, row, col)) return { game: state, hints };

  const game = reveal(state, row, col);
  return {
    game,
    hints: {
      ...hints,
      letterRemaining: false,
      hintsUsed: hints.hintsUsed + 1,
    },
  };
}

/* ─────────────────────── Advanced-mode application ──────────────────────── */

/**
 * Advanced application: after a reveal produced `revealedBase` (a GameState with
 * the correct graphemes written), adopt it as the AdvancedState's `base` and
 * LOCK every revealed cell — exactly as a successful submit would. Locked cells
 * become immovable and count as solved. Pass the same coords that were revealed.
 *
 * Pure: returns a NEW AdvancedState. `mistakes`, `palette`, `seed`, `dealCount`
 * are preserved (a hint never costs an Advanced mistake; the palette is left as
 * is — the screen may re-deal on its next submit, and locked cells are excluded
 * from `neededGraphemes` automatically).
 */
export function lockRevealed(
  adv: AdvancedState,
  revealedBase: GameState,
  coords: readonly Coord[],
): AdvancedState {
  const locked = new Set(adv.locked);
  for (const c of coords) locked.add(`${c.row},${c.col}`);
  return { ...adv, base: revealedBase, locked };
}
