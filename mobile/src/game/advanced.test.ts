import type { GridData } from "@/game/gridData.types";
import { cellEntry, checkCell } from "@/game/engine";
import {
  createAdvancedState,
  isSolved,
  placeLetter,
  remainingCells,
  submit,
  unplaceLetter,
  type AdvancedState,
} from "@/game/advanced";

/**
 * Hand-crafted fixture: a tiny 4x4 grid with two crossing words.
 * (Adapted from engine.test.ts.)
 *
 *   - Across word "wA" at row 1, cols 1..3, solution ["NJ","O","S"].
 *     The FIRST cell is a DIGRAPH grapheme "NJ" occupying a single cell.
 *   - Down word "wD" at col 2, rows 1..2, solution ["O","K"].
 *
 * They share cell (1,2) whose solution is "O" — the intersection.
 *
 *   (1,1)=NJ  (1,2)=O   (1,3)=S
 *             (2,2)=K
 *
 * 4 letter cells, needed multiset = { NJ, O, S, K }.
 */
function makeGrid(): GridData {
  return {
    width: 4,
    height: 4,
    cells: [
      { kind: "letter", row: 1, col: 1, solution: "NJ", words: [{ wordId: "wA", index: 0 }] },
      {
        kind: "letter",
        row: 1,
        col: 2,
        solution: "O",
        words: [
          { wordId: "wA", index: 1 },
          { wordId: "wD", index: 0 },
        ],
      },
      { kind: "letter", row: 1, col: 3, solution: "S", words: [{ wordId: "wA", index: 2 }] },
      { kind: "letter", row: 2, col: 2, solution: "K", words: [{ wordId: "wD", index: 1 }] },
      { kind: "clue", row: 0, col: 1, clueId: "cA", dir: "across" },
      { kind: "clue", row: 0, col: 2, clueId: "cD", dir: "down" },
      { kind: "blank", row: 0, col: 0 },
    ],
    words: [
      {
        id: "wA",
        dir: "across",
        cells: [
          { row: 1, col: 1 },
          { row: 1, col: 2 },
          { row: 1, col: 3 },
        ],
        solution: ["NJ", "O", "S"],
        clueId: "cA",
        clueCell: { row: 0, col: 1 },
      },
      {
        id: "wD",
        dir: "down",
        cells: [
          { row: 1, col: 2 },
          { row: 2, col: 2 },
        ],
        solution: ["O", "K"],
        clueId: "cD",
        clueCell: { row: 0, col: 2 },
      },
    ],
    clues: {
      cA: { type: "text", text: "across clue" },
      cD: { type: "text", text: "down clue" },
    },
  };
}

/**
 * A bigger fixture (one long across word) so the palette can actually be
 * capped at 5 while more letters remain needed. 7 letter cells.
 * solution = O B R A D O M  (cols 1..7 on row 1).
 */
function makeWideGrid(): GridData {
  const sol = ["O", "B", "R", "A", "D", "O", "M"];
  return {
    width: 9,
    height: 3,
    cells: [
      ...sol.map((s, i) => ({
        kind: "letter" as const,
        row: 1,
        col: 1 + i,
        solution: s,
        words: [{ wordId: "wA", index: i }],
      })),
      { kind: "clue", row: 0, col: 1, clueId: "cA", dir: "across" as const },
    ],
    words: [
      {
        id: "wA",
        dir: "across",
        cells: sol.map((_, i) => ({ row: 1, col: 1 + i })),
        solution: sol,
        clueId: "cA",
        clueCell: { row: 0, col: 1 },
      },
    ],
    clues: { cA: { type: "text", text: "across clue" } },
  };
}

const NEEDED = ["NJ", "O", "S", "K"];

/** Multiset of solutions for all letter cells of a grid. */
function allSolutions(grid: GridData): string[] {
  return grid.cells
    .filter((c) => c.kind === "letter")
    .map((c) => (c as { solution: string }).solution);
}

/** Find a palette index holding a given grapheme, or -1. */
function paletteIndexOf(state: AdvancedState, grapheme: string): number {
  return state.palette.indexOf(grapheme);
}

/** Drive a full solve by always placing correct letters, then submitting. */
function solveAll(state: AdvancedState): AdvancedState {
  const grid = state.base.grid;
  const letterCells = grid.cells.filter((c) => c.kind === "letter") as Array<{
    row: number;
    col: number;
    solution: string;
  }>;
  let s = state;
  let guard = 0;
  while (!isSolved(s)) {
    guard += 1;
    if (guard > 1000) throw new Error("solve loop did not terminate");
    // For each empty unlocked cell, if its solution is in the palette, place it.
    let placedSomething = false;
    for (const cell of letterCells) {
      const k = `${cell.row},${cell.col}`;
      if (s.locked.has(k)) continue;
      if (cellEntry(s.base, cell.row, cell.col) !== null) continue; // already tentatively placed
      const idx = paletteIndexOf(s, cell.solution);
      if (idx >= 0) {
        s = placeLetter(s, idx, cell.row, cell.col);
        placedSomething = true;
      }
    }
    s = submit(s);
    if (!placedSomething && !isSolved(s)) {
      // Defensive: should not happen since deal is from needed graphemes.
      throw new Error("no progress possible");
    }
  }
  return s;
}

describe("createAdvancedState", () => {
  it("starts with empty base board, zero mistakes, nothing locked", () => {
    const s = createAdvancedState(makeGrid(), 1);
    expect(s.mistakes).toBe(0);
    expect(s.locked.size).toBe(0);
    for (const cell of allSolutions(makeGrid())) void cell;
    expect(cellEntry(s.base, 1, 1)).toBeNull();
    expect(cellEntry(s.base, 1, 2)).toBeNull();
    expect(cellEntry(s.base, 1, 3)).toBeNull();
    expect(cellEntry(s.base, 2, 2)).toBeNull();
    expect(isSolved(s)).toBe(false);
  });

  it("deals up to 5 real letters that are all among the board's needed graphemes", () => {
    const s = createAdvancedState(makeGrid(), 7);
    // Only 4 cells -> palette holds at most 4.
    expect(s.palette.length).toBe(4);
    for (const g of s.palette) {
      expect(NEEDED).toContain(g);
    }
  });

  it("caps the palette at 5 even when more letters are needed", () => {
    const s = createAdvancedState(makeWideGrid(), 3);
    expect(s.palette.length).toBe(5);
    const needed = allSolutions(makeWideGrid());
    for (const g of s.palette) expect(needed).toContain(g);
  });
});

describe("placeLetter / unplaceLetter", () => {
  it("placeLetter writes the tentative letter into the base cell", () => {
    let s = createAdvancedState(makeGrid(), 7);
    const idx = paletteIndexOf(s, "NJ");
    expect(idx).toBeGreaterThanOrEqual(0);
    s = placeLetter(s, idx, 1, 1);
    expect(cellEntry(s.base, 1, 1)).toBe("NJ");
  });

  it("a placed palette letter is consumed from the palette until unplaced", () => {
    let s = createAdvancedState(makeGrid(), 7);
    const before = s.palette.length;
    const idx = paletteIndexOf(s, "O");
    s = placeLetter(s, idx, 1, 2);
    // The 'O' tile is no longer offered in the available palette.
    expect(s.palette.filter((g) => g === "O").length).toBe(0);
    s = unplaceLetter(s, 1, 2);
    expect(cellEntry(s.base, 1, 2)).toBeNull();
    expect(s.palette.length).toBe(before);
    expect(paletteIndexOf(s, "O")).toBeGreaterThanOrEqual(0);
  });

  it("placeLetter cannot target a locked cell", () => {
    let s = createAdvancedState(makeGrid(), 7);
    // Lock (1,1) by placing the correct NJ and submitting.
    s = placeLetter(s, paletteIndexOf(s, "NJ"), 1, 1);
    s = submit(s);
    expect(s.locked.has("1,1")).toBe(true);
    const lockedEntry = cellEntry(s.base, 1, 1);
    // Attempt to place over the locked cell — should be a no-op.
    const anyIdx = 0;
    const after = placeLetter(s, anyIdx, 1, 1);
    expect(cellEntry(after.base, 1, 1)).toBe(lockedEntry);
  });

  it("does not mutate the input state (immutable)", () => {
    const s0 = createAdvancedState(makeGrid(), 7);
    const s1 = placeLetter(s0, paletteIndexOf(s0, "NJ"), 1, 1);
    expect(s1).not.toBe(s0);
    expect(cellEntry(s0.base, 1, 1)).toBeNull();
  });
});

describe("submit — locks correct placements", () => {
  it("locks a correctly placed cell and refills the palette with new letters", () => {
    let s = createAdvancedState(makeGrid(), 7);
    s = placeLetter(s, paletteIndexOf(s, "NJ"), 1, 1);
    s = submit(s);
    expect(s.locked.has("1,1")).toBe(true);
    expect(checkCell(s.base, 1, 1)).toBe("correct");
    expect(s.mistakes).toBe(0);
    // 3 cells remain -> palette refilled to min(5, 3) = 3, only needed graphemes.
    expect(s.palette.length).toBe(3);
    const remainingNeeded = ["O", "S", "K"];
    for (const g of s.palette) expect(remainingNeeded).toContain(g);
  });

  it("a locked cell cannot be unplaced", () => {
    let s = createAdvancedState(makeGrid(), 7);
    s = placeLetter(s, paletteIndexOf(s, "NJ"), 1, 1);
    s = submit(s);
    const after = unplaceLetter(s, 1, 1);
    expect(after.locked.has("1,1")).toBe(true);
    expect(cellEntry(after.base, 1, 1)).toBe("NJ");
  });
});

describe("submit — clears wrong placements and counts mistakes", () => {
  it("removes a wrong letter, increments mistakes, and the cell is emptied", () => {
    let s = createAdvancedState(makeGrid(), 7);
    // Place 'O' (a real palette letter) into the WRONG cell (1,1) whose sol is NJ.
    const oIdx = paletteIndexOf(s, "O");
    s = placeLetter(s, oIdx, 1, 1);
    expect(cellEntry(s.base, 1, 1)).toBe("O");
    s = submit(s);
    expect(s.mistakes).toBe(1);
    expect(cellEntry(s.base, 1, 1)).toBeNull(); // cleared
    expect(s.locked.has("1,1")).toBe(false);
  });

  it("counts one mistake per wrong placement in a single submit", () => {
    let s = createAdvancedState(makeGrid(), 7);
    // Place O at (1,1) [wrong] and S at (1,2) [wrong, sol is O].
    s = placeLetter(s, paletteIndexOf(s, "O"), 1, 1);
    s = placeLetter(s, paletteIndexOf(s, "S"), 1, 2);
    s = submit(s);
    expect(s.mistakes).toBe(2);
  });
});

describe("refill draws only needed letters (no decoys, v1)", () => {
  it("after locking cells, palette never contains a grapheme not still needed", () => {
    let s = createAdvancedState(makeWideGrid(), 11);
    const fullSolution = allSolutions(makeWideGrid());
    let guard = 0;
    while (!isSolved(s)) {
      guard += 1;
      if (guard > 1000) throw new Error("did not terminate");
      // Compute the still-needed multiset.
      const stillNeeded: string[] = [];
      const letterCells = makeWideGrid().cells.filter(
        (c) => c.kind === "letter",
      ) as Array<{ row: number; col: number; solution: string }>;
      for (const cell of letterCells) {
        const k = `${cell.row},${cell.col}`;
        if (!s.locked.has(k)) stillNeeded.push(cell.solution);
      }
      // Every palette tile must be drawable from the still-needed multiset.
      const pool = [...stillNeeded];
      for (const g of s.palette) {
        const i = pool.indexOf(g);
        expect(i).toBeGreaterThanOrEqual(0); // present & not over-counted
        pool.splice(i, 1);
      }
      // Place one correct letter and submit to make progress.
      let placed = false;
      for (const cell of letterCells) {
        const k = `${cell.row},${cell.col}`;
        if (s.locked.has(k)) continue;
        if (cellEntry(s.base, cell.row, cell.col) !== null) continue;
        const idx = paletteIndexOf(s, cell.solution);
        if (idx >= 0) {
          s = placeLetter(s, idx, cell.row, cell.col);
          placed = true;
          break;
        }
      }
      expect(placed).toBe(true);
      s = submit(s);
    }
    expect(fullSolution.length).toBe(7);
  });
});

describe("full solve loop", () => {
  it("terminates solved with 0 mistakes when always placing correct letters", () => {
    const s = solveAll(createAdvancedState(makeGrid(), 7));
    expect(isSolved(s)).toBe(true);
    expect(s.mistakes).toBe(0);
    expect(remainingCells(s)).toBe(0);
    expect(s.palette.length).toBe(0);
  });

  it("terminates solved on the wide grid too", () => {
    const s = solveAll(createAdvancedState(makeWideGrid(), 99));
    expect(isSolved(s)).toBe(true);
    expect(s.mistakes).toBe(0);
  });

  it("ends solved with the expected mistake count after some wrong placements", () => {
    let s = createAdvancedState(makeGrid(), 7);
    // Deliberately misplace: put O into (1,1) [wrong], then submit (mistake 1).
    s = placeLetter(s, paletteIndexOf(s, "O"), 1, 1);
    s = submit(s);
    expect(s.mistakes).toBe(1);
    // Now solve the rest correctly.
    s = solveAll(s);
    expect(isSolved(s)).toBe(true);
    expect(s.mistakes).toBe(1);
  });
});

describe("digraph", () => {
  it("deals 'NJ' as a single tile that fills one cell correctly", () => {
    let s = createAdvancedState(makeGrid(), 7);
    const idx = paletteIndexOf(s, "NJ");
    expect(idx).toBeGreaterThanOrEqual(0);
    // It is ONE tile (string length irrelevant; it's one palette entry).
    s = placeLetter(s, idx, 1, 1);
    expect(cellEntry(s.base, 1, 1)).toBe("NJ");
    s = submit(s);
    expect(checkCell(s.base, 1, 1)).toBe("correct");
    expect(s.locked.has("1,1")).toBe(true);
  });
});

describe("determinism", () => {
  it("same seed -> identical initial deal", () => {
    const a = createAdvancedState(makeWideGrid(), 42);
    const b = createAdvancedState(makeWideGrid(), 42);
    expect(a.palette).toEqual(b.palette);
  });

  it("different seeds -> (generally) different deal order", () => {
    const a = createAdvancedState(makeWideGrid(), 1);
    const b = createAdvancedState(makeWideGrid(), 2);
    // Not a hard guarantee, but with mulberry32 these differ.
    expect(a.palette).not.toEqual(b.palette);
  });

  it("same seed + same actions -> identical resulting palette", () => {
    function run(seed: number): AdvancedState {
      let s = createAdvancedState(makeWideGrid(), seed);
      s = placeLetter(s, paletteIndexOf(s, "B"), 1, 2);
      s = submit(s);
      return s;
    }
    expect(run(5).palette).toEqual(run(5).palette);
  });
});
