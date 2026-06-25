/**
 * Low-level crossword grid model and word-placement primitives.
 *
 * This module is intentionally language-agnostic: it operates purely on
 * GRAPHEME ARRAYS (the output of `splitGraphemes` in `graphemes.ts`). A single
 * grid cell holds exactly one grapheme string, which may be a multi-code-point
 * digraph such as "NJ", "LJ" or "DŽ". The grid never re-splits or interprets the
 * graphemes it stores — all South-Slavic orthography rules live upstream. This
 * keeps the grid reusable and the placement logic a simple string-equality
 * problem.
 *
 * COORDINATE CONVENTION
 *   - `row`: 0 .. height-1, top -> bottom.
 *   - `col`: 0 .. width-1,  left -> right.
 *   - An "across" word runs left -> right, incrementing `col`.
 *   - A "down" word runs top -> bottom, incrementing `row`.
 *   The cell store is a flat row-major array indexed by `row * width + col`.
 *
 * MUTABILITY
 *   `createGrid` and `placeWord` are pure: `placeWord` returns a NEW grid and
 *   never mutates its input (the cell array and the words list are copied). This
 *   lets the layout builder (Task 2.4) try a placement, keep the result on
 *   success, and simply discard it on backtrack without any undo bookkeeping.
 *
 * SCOPE
 *   This module enforces only the generic invariants needed to place words:
 *   in-bounds and no conflicting grapheme on any occupied cell. It does NOT
 *   enforce project-specific limits (grid 6-9 wide, 6-12 tall) or crossword
 *   "rules" like requiring every word to intersect another, no accidental
 *   adjacent parallel words, etc. Those belong to the layout builder.
 */

export type Direction = "across" | "down";

/**
 * Metadata for one placed word. `length` is redundant with `graphemes.length`
 * but is recorded explicitly because the serializer / client expresses a word's
 * footprint as (start cell, direction, length) and it is convenient to have it
 * directly. `graphemes` is retained so the answer can be reconstructed without
 * re-reading the grid cells.
 */
export interface PlacedWord {
  readonly graphemes: readonly string[];
  readonly row: number;
  readonly col: number;
  readonly dir: Direction;
  readonly length: number;
}

/**
 * A crossword grid. `cells` is a flat, row-major array of length width*height;
 * each entry is the grapheme occupying that cell, or `null` if empty. `words` is
 * the list of words placed so far, in placement order.
 *
 * Per-cell word ownership (needed for intersection-aware logic in later tasks)
 * is derivable from `words` + the coordinate convention; we deliberately do NOT
 * store a redundant per-cell owner index here (YAGNI) — the layout builder can
 * compute it cheaply when it needs it. Intersections themselves do not require
 * ownership data: a crossing is simply two words whose cells overlap on an
 * equal grapheme, which `canPlace` already validates.
 */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly cells: ReadonlyArray<string | null>;
  readonly words: readonly PlacedWord[];
}

/** Flat row-major index for (row, col). Caller must ensure bounds. */
function indexOf(grid: Grid, row: number, col: number): number {
  return row * grid.width + col;
}

/** True if (row, col) is inside the grid. */
function inBounds(grid: Grid, row: number, col: number): boolean {
  return row >= 0 && row < grid.height && col >= 0 && col < grid.width;
}

/**
 * Step deltas for a direction: across advances columns, down advances rows.
 */
function step(dir: Direction): { dRow: number; dCol: number } {
  return dir === "across" ? { dRow: 0, dCol: 1 } : { dRow: 1, dCol: 0 };
}

/**
 * Creates an empty grid of the given dimensions. All cells are `null` and no
 * words are placed.
 */
export function createGrid(width: number, height: number): Grid {
  return {
    width,
    height,
    cells: new Array<string | null>(width * height).fill(null),
    words: [],
  };
}

/**
 * Reads the grapheme at (row, col), or `null` if the cell is empty.
 * Out-of-bounds coordinates also read as `null`.
 */
export function cellAt(grid: Grid, row: number, col: number): string | null {
  if (!inBounds(grid, row, col)) {
    return null;
  }
  return grid.cells[indexOf(grid, row, col)];
}

/**
 * Reports whether `graphemes` can legally be written starting at (row, col)
 * running in `dir`.
 *
 * Returns `false` when:
 *   - any target cell falls outside the grid (out of bounds), OR
 *   - any target cell already holds a DIFFERENT grapheme (a conflict).
 *
 * Returns `true` when every target cell is either empty OR already holds the
 * SAME grapheme (a valid crossing / intersection). An empty word vacuously
 * fits.
 */
export function canPlace(
  grid: Grid,
  graphemes: string[],
  row: number,
  col: number,
  dir: Direction,
): boolean {
  const { dRow, dCol } = step(dir);
  for (let i = 0; i < graphemes.length; i++) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    if (!inBounds(grid, r, c)) {
      return false;
    }
    const existing = grid.cells[indexOf(grid, r, c)];
    if (existing !== null && existing !== graphemes[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Returns a NEW grid with `graphemes` written from (row, col) in `dir`. The
 * input grid is not mutated. Cells that already hold the same grapheme are
 * shared crossings and remain unchanged in value.
 *
 * Throws if the placement is illegal (see `canPlace`). Callers in the layout
 * builder should gate this with `canPlace`; the throw is a safety net against
 * logic errors, not a control-flow path.
 */
export function placeWord(
  grid: Grid,
  graphemes: string[],
  row: number,
  col: number,
  dir: Direction,
): Grid {
  if (!canPlace(grid, graphemes, row, col, dir)) {
    throw new Error(
      `Illegal word placement: ${graphemes.join("")} at (${row},${col}) ${dir} ` +
        `on a ${grid.width}x${grid.height} grid`,
    );
  }

  const cells = grid.cells.slice();
  const { dRow, dCol } = step(dir);
  for (let i = 0; i < graphemes.length; i++) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    cells[indexOf(grid, r, c)] = graphemes[i];
  }

  const placed: PlacedWord = {
    graphemes: graphemes.slice(),
    row,
    col,
    dir,
    length: graphemes.length,
  };

  return {
    width: grid.width,
    height: grid.height,
    cells,
    words: [...grid.words, placed],
  };
}
