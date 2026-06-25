/**
 * Skandinavka (Scandinavian-style) crossword LAYOUT BUILDER.
 *
 * Given a candidate word list and grid dimensions, this packs words into a
 * single CONNECTED crossword and assigns every answer a CLUE CELL plus an arrow
 * direction. It is the technical core of the generator; its output feeds
 * difficulty scoring (2.5) and serialization to the client (2.6).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SKANDINAVKA GEOMETRY (the clue-cell model)
 * ─────────────────────────────────────────────────────────────────────────
 * In a skandinavka the clue/definition text lives INSIDE a grid cell — the
 * "clue cell" — and a small arrow in that cell points at where the answer
 * starts and which way it runs:
 *
 *   - ACROSS answer: the clue cell sits immediately to the LEFT of the first
 *     letter, arrow pointing right.  clueCell = (row,     col - 1).
 *   - DOWN   answer: the clue cell sits immediately ABOVE the first letter,
 *     arrow pointing down.            clueCell = (row - 1, col).
 *
 * A clue cell is NOT a letter cell: answer letters are never written into it.
 * We enforce a stronger, symmetric rule than "clue cell is not a letter cell":
 *
 *   (a) a clue cell must be in-bounds;
 *   (b) a clue cell must not coincide with any answer's LETTER cell;
 *   (c) a letter cell must not coincide with any already-reserved CLUE cell.
 *
 * (c) is the dual of (b): if we let a later word's letters land on an earlier
 * word's clue cell, that earlier clue would be destroyed. Reserving clue cells
 * and refusing letters on them keeps every clue valid for the whole build.
 *
 * (Two answers MAY legitimately share a clue cell position only if it is the
 * exact same coordinate — but we forbid that too, to keep one clue == one cell
 * for the client; see `reservedClueKeys`.)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ALGORITHM (greedy, intersection-driven, deterministic)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. SEED: pick the longest candidate (ties broken by RNG-shuffled order) and
 *    place it interior so its clue cell fits in-bounds. We place it across at a
 *    central row with col >= 1 (so clueCol = col - 1 >= 0).
 * 2. GROW: repeatedly scan remaining candidates; for each, enumerate every
 *    placement that CROSSES an already-placed word on a matching grapheme
 *    (anchored on a shared letter), and that satisfies `canPlace` + the
 *    clue-cell rules above. Score each placement by number of crossings; keep
 *    the best (ties → RNG). Place it, reserve its clue cell, repeat.
 * 3. STOP when no remaining candidate has any legal crossing placement, or the
 *    candidate list is exhausted. Best-effort: not all words need be placed.
 *
 * DETERMINISM: all randomness comes from the injected `rng`. Candidate order
 * and tie-breaks are derived from it; there is no `Math.random`, no `Date`, no
 * iteration over unordered structures whose order could vary. Same
 * {width,height,words,seed} ⇒ identical `Layout` (deep-equal).
 *
 * The builder reuses `grid.ts` (`canPlace`/`placeWord`) for the letter-grid
 * invariants (in-bounds, equal-grapheme crossings) and layers the skandinavka
 * clue-cell rules and connectivity on top.
 */

import {
  canPlace,
  createGrid,
  placeWord,
  type Direction,
  type Grid,
} from "./grid.js";

/** One placed answer with its letter run AND its skandinavka clue cell. */
export interface LayoutWord {
  /** The answer split into one grapheme per letter cell. */
  readonly graphemes: string[];
  /** Row of the first letter (top→bottom, 0-based). */
  readonly row: number;
  /** Col of the first letter (left→right, 0-based). */
  readonly col: number;
  /** Reading direction; the clue arrow points this way. */
  readonly dir: Direction;
  /** Row of the clue cell (= row for across, row-1 for down). */
  readonly clueRow: number;
  /** Col of the clue cell (= col-1 for across, col for down). */
  readonly clueCol: number;
}

/**
 * A completed layout. `cells` is the resolved row-major letter grid (grapheme
 * or null per cell), mirroring `Grid.cells`, so downstream tasks (2.5/2.6) can
 * read letters directly without re-deriving them. Clue cells are NOT marked in
 * `cells` (they hold `null` there); each clue cell is described per word via
 * `clueRow`/`clueCol`.
 */
export interface Layout {
  readonly width: number;
  readonly height: number;
  readonly words: LayoutWord[];
  readonly cells: ReadonlyArray<string | null>;
}

export interface BuildLayoutOptions {
  width: number;
  height: number;
  /** Candidate words, already split into graphemes (one per cell). */
  words: { graphemes: string[] }[];
  /** Seeded RNG in [0,1); injected for determinism. Never use Math.random. */
  rng: () => number;
}

/** Step deltas for a direction (mirrors grid.ts). */
function step(dir: Direction): { dRow: number; dCol: number } {
  return dir === "across" ? { dRow: 0, dCol: 1 } : { dRow: 1, dCol: 0 };
}

/** The clue cell for a word starting at (row,col) running `dir`. */
function clueCellOf(
  row: number,
  col: number,
  dir: Direction,
): { clueRow: number; clueCol: number } {
  return dir === "across"
    ? { clueRow: row, clueCol: col - 1 }
    : { clueRow: row - 1, clueCol: col };
}

function key(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Deterministic Fisher–Yates shuffle driven by the injected RNG. Returns a new
 * array; does not mutate the input. Used to randomize candidate order and break
 * ties reproducibly.
 */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Internal mutable build state threaded through the greedy loop. */
interface BuildState {
  grid: Grid;
  placed: LayoutWord[];
  /** Keys ("r,c") of every reserved clue cell (rule (c)). */
  reservedClueKeys: Set<string>;
  /** Keys ("r,c") of every letter cell currently occupied. */
  letterKeys: Set<string>;
}

/** All letter-cell keys a word would occupy if placed at (row,col,dir). */
function wordCellKeys(
  graphemes: string[],
  row: number,
  col: number,
  dir: Direction,
): string[] {
  const { dRow, dCol } = step(dir);
  const keys: string[] = [];
  for (let i = 0; i < graphemes.length; i++) {
    keys.push(key(row + dRow * i, col + dCol * i));
  }
  return keys;
}

/**
 * Validates the skandinavka-specific rules for a candidate placement, assuming
 * `canPlace` (in-bounds + equal-grapheme crossings) has already passed:
 *   - none of the word's letter cells fall on a reserved clue cell (rule (c));
 *   - the word's own clue cell is in-bounds (rule (a));
 *   - the clue cell is not an existing letter cell, nor a letter cell this very
 *     word is about to write (rule (b));
 *   - the clue cell is not already reserved by another word.
 */
function clueRulesOk(
  state: BuildState,
  graphemes: string[],
  row: number,
  col: number,
  dir: Direction,
): boolean {
  const cells = wordCellKeys(graphemes, row, col, dir);

  // Rule (c): no letter of this word may land on a reserved clue cell.
  for (const k of cells) {
    if (state.reservedClueKeys.has(k)) {
      return false;
    }
  }

  const { clueRow, clueCol } = clueCellOf(row, col, dir);

  // Rule (a): clue cell in-bounds.
  if (
    clueRow < 0 ||
    clueRow >= state.grid.height ||
    clueCol < 0 ||
    clueCol >= state.grid.width
  ) {
    return false;
  }

  const clueKey = key(clueRow, clueCol);

  // Rule (b): clue cell is not an existing letter cell...
  if (state.letterKeys.has(clueKey)) {
    return false;
  }
  // ...nor a letter cell this word is about to write (self-collision).
  if (cells.includes(clueKey)) {
    return false;
  }

  // One clue == one cell: do not reuse a clue cell already taken by another word.
  if (state.reservedClueKeys.has(clueKey)) {
    return false;
  }

  return true;
}

/** Counts how many cells of a placement land on existing letter cells (crossings). */
function countCrossings(
  state: BuildState,
  graphemes: string[],
  row: number,
  col: number,
  dir: Direction,
): number {
  let n = 0;
  for (const k of wordCellKeys(graphemes, row, col, dir)) {
    if (state.letterKeys.has(k)) {
      n++;
    }
  }
  return n;
}

/** Commits a placement into the build state (mutates `state`). */
function commit(
  state: BuildState,
  graphemes: string[],
  row: number,
  col: number,
  dir: Direction,
): void {
  state.grid = placeWord(state.grid, graphemes, row, col, dir);
  for (const k of wordCellKeys(graphemes, row, col, dir)) {
    state.letterKeys.add(k);
  }
  const { clueRow, clueCol } = clueCellOf(row, col, dir);
  state.reservedClueKeys.add(key(clueRow, clueCol));
  state.placed.push({
    graphemes: graphemes.slice(),
    row,
    col,
    dir,
    clueRow,
    clueCol,
  });
}

/**
 * Places the seed word: the longest candidate, oriented across, centered, with
 * col >= 1 so its clue cell (col-1) is in-bounds. Returns the index of the
 * candidate consumed, or -1 if no seed could be placed (e.g. every candidate is
 * wider than the grid can hold with a clue column).
 *
 * Candidates are pre-shuffled by the caller, so "longest" ties break on the
 * RNG-determined order — keeping seed choice deterministic yet seed-dependent.
 */
function placeSeed(
  state: BuildState,
  candidates: { graphemes: string[]; origIndex: number }[],
): number {
  // Pick the longest; ties resolved by current (shuffled) order via a stable scan.
  let bestPos = -1;
  let bestLen = -1;
  for (let i = 0; i < candidates.length; i++) {
    const len = candidates[i].graphemes.length;
    if (len > bestLen) {
      bestLen = len;
      bestPos = i;
    }
  }
  if (bestPos === -1) {
    return -1;
  }

  const { graphemes } = candidates[bestPos];
  const { width, height } = state.grid;
  const row = Math.floor(height / 2);

  // Center horizontally but ensure col >= 1 (clue cell at col-1 in-bounds) and
  // the word fits. If the word is too wide to leave a clue column, bail.
  if (graphemes.length + 1 > width) {
    return -1;
  }
  const maxCol = width - graphemes.length;
  let col = Math.floor((width - graphemes.length) / 2);
  if (col < 1) col = 1;
  if (col > maxCol) col = maxCol;

  if (
    col >= 1 &&
    canPlace(state.grid, graphemes, row, col, "across") &&
    clueRulesOk(state, graphemes, row, col, "across")
  ) {
    commit(state, graphemes, row, col, "across");
    return bestPos;
  }

  return -1;
}

/**
 * Finds the best crossing placement for one candidate against the current
 * state. Enumerates: for each occupied letter cell, for each letter in the
 * candidate equal to that cell's grapheme, the placement that aligns them in
 * each orientation. Returns the highest-crossing legal placement (ties → RNG),
 * or null if none is legal.
 */
function bestPlacementFor(
  state: BuildState,
  graphemes: string[],
  rng: () => number,
): { row: number; col: number; dir: Direction; crossings: number } | null {
  interface Cand {
    row: number;
    col: number;
    dir: Direction;
    crossings: number;
  }
  const seen = new Set<string>();
  const candidates: Cand[] = [];

  // Index occupied letter cells by grapheme so we only try meaningful anchors.
  // Iterate placed words in placement order for deterministic enumeration.
  for (const placed of state.placed) {
    const { dRow, dCol } = step(placed.dir);
    for (let p = 0; p < placed.graphemes.length; p++) {
      const cellRow = placed.row + dRow * p;
      const cellCol = placed.col + dCol * p;
      const cellG = placed.graphemes[p];

      for (let i = 0; i < graphemes.length; i++) {
        if (graphemes[i] !== cellG) continue;

        // Anchor: candidate's letter i sits on (cellRow, cellCol). A candidate
        // typically crosses perpendicular to the word it anchors on, but we try
        // both orientations and rely on canPlace to reject conflicts.
        for (const dir of ["across", "down"] as const) {
          const { dRow: aDr, dCol: aDc } = step(dir);
          const row = cellRow - aDr * i;
          const col = cellCol - aDc * i;
          const dedupeKey = `${row},${col},${dir}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          if (!canPlace(state.grid, graphemes, row, col, dir)) continue;
          if (!clueRulesOk(state, graphemes, row, col, dir)) continue;

          const crossings = countCrossings(state, graphemes, row, col, dir);
          // A real crossing must share >=1 existing letter cell, else the word
          // would float (violating connectivity).
          if (crossings < 1) continue;

          candidates.push({ row, col, dir, crossings });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Pick max crossings; break ties deterministically via an RNG shuffle so the
  // choice is seed-dependent but reproducible.
  const maxCrossings = Math.max(...candidates.map((c) => c.crossings));
  const best = candidates.filter((c) => c.crossings === maxCrossings);
  const pick = shuffled(best, rng)[0];
  return pick;
}

/**
 * Builds a connected skandinavka layout from the candidate words. Best-effort
 * packing: places as many candidates as legally interlock. See the module
 * header for the full algorithm, geometry, and determinism guarantees.
 */
export function buildLayout(opts: BuildLayoutOptions): Layout {
  const { width, height, rng } = opts;

  const state: BuildState = {
    grid: createGrid(width, height),
    placed: [],
    reservedClueKeys: new Set<string>(),
    letterKeys: new Set<string>(),
  };

  // No words: return an empty, valid layout.
  if (opts.words.length === 0) {
    return { width, height, words: [], cells: state.grid.cells };
  }

  // Build the working candidate pool, tagging original indices (unused by the
  // result but handy for debugging), then shuffle for deterministic ordering.
  const pool = shuffled(
    opts.words.map((w, origIndex) => ({
      graphemes: w.graphemes.slice(),
      origIndex,
    })),
    rng,
  );

  // 1. Seed.
  const seedPos = placeSeed(state, pool);
  if (seedPos >= 0) {
    pool.splice(seedPos, 1);
  } else {
    // No seed could be placed (every word too wide for a clue column, etc.).
    return { width, height, words: [], cells: state.grid.cells };
  }

  // 2. Grow greedily until no candidate can be placed.
  // Bounded by the candidate count: each outer pass places at most all
  // remaining words, and we stop the instant a full pass places nothing — so
  // the loop runs at most `pool.length` passes and always terminates.
  let progress = true;
  while (progress && pool.length > 0) {
    progress = false;

    // Score every remaining candidate's best placement, then place the single
    // globally-best one (most crossings) this pass. This yields denser, more
    // interlocked layouts than first-fit. Ties broken via RNG.
    interface PoolPlacement {
      poolIndex: number;
      row: number;
      col: number;
      dir: Direction;
      crossings: number;
    }
    const options: PoolPlacement[] = [];
    for (let i = 0; i < pool.length; i++) {
      const placement = bestPlacementFor(state, pool[i].graphemes, rng);
      if (placement) {
        options.push({ poolIndex: i, ...placement });
      }
    }

    if (options.length > 0) {
      const maxCrossings = Math.max(...options.map((o) => o.crossings));
      const best = options.filter((o) => o.crossings === maxCrossings);
      const chosen = shuffled(best, rng)[0];
      const cand = pool[chosen.poolIndex];
      commit(state, cand.graphemes, chosen.row, chosen.col, chosen.dir);
      pool.splice(chosen.poolIndex, 1);
      progress = true;
    }
  }

  return {
    width,
    height,
    words: state.placed,
    cells: state.grid.cells,
  };
}
