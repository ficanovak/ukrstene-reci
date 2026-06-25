import { describe, expect, it } from "vitest";

import {
  canPlace,
  cellAt,
  createGrid,
  placeWord,
  type Grid,
} from "./grid.js";

const MACKA = ["M", "A", "Č", "K", "A"];

describe("createGrid", () => {
  it("creates a grid with the given dimensions", () => {
    const grid = createGrid(6, 6);
    expect(grid.width).toBe(6);
    expect(grid.height).toBe(6);
  });

  it("starts with every cell empty (null)", () => {
    const grid = createGrid(6, 6);
    for (let row = 0; row < grid.height; row++) {
      for (let col = 0; col < grid.width; col++) {
        expect(cellAt(grid, row, col)).toBeNull();
      }
    }
  });

  it("starts with no placed words", () => {
    const grid = createGrid(6, 6);
    expect(grid.words).toEqual([]);
  });

  it("supports non-square dimensions", () => {
    const grid = createGrid(7, 9);
    expect(grid.width).toBe(7);
    expect(grid.height).toBe(9);
    expect(cellAt(grid, 8, 6)).toBeNull();
  });
});

describe("canPlace bounds", () => {
  it("returns false when an across word runs off the right edge", () => {
    // width 6 grid, 4-grapheme word starting at col 4 across ends at col 7 -> out
    const grid = createGrid(6, 6);
    expect(canPlace(grid, ["A", "B", "C", "D"], 0, 4, "across")).toBe(false);
  });

  it("returns false when a down word runs off the bottom edge", () => {
    const grid = createGrid(6, 6);
    expect(canPlace(grid, ["A", "B", "C", "D"], 4, 0, "down")).toBe(false);
  });

  it("returns false for a negative starting coordinate", () => {
    const grid = createGrid(6, 6);
    expect(canPlace(grid, ["A"], -1, 0, "across")).toBe(false);
    expect(canPlace(grid, ["A"], 0, -1, "down")).toBe(false);
  });

  it("returns true when an across word fits exactly to the edge", () => {
    const grid = createGrid(6, 6);
    expect(canPlace(grid, ["A", "B", "C", "D"], 0, 2, "across")).toBe(true);
  });
});

describe("canPlace conflicts and crossings", () => {
  it("returns false when a crossing cell holds a different grapheme", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, MACKA, 0, 0, "across"); // M A Č K A across row 0
    // Down word crossing column 2 (the Č cell) at row 0, but with "X" there.
    expect(canPlace(grid, ["X", "Y", "Z"], 0, 2, "down")).toBe(false);
  });

  it("returns true when a crossing cell holds the SAME grapheme", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, MACKA, 0, 0, "across");
    // Down word whose first cell is the shared Č at (0,2).
    expect(canPlace(grid, ["Č", "Y", "Z"], 0, 2, "down")).toBe(true);
  });

  it("returns true for a word placed in entirely empty cells", () => {
    const grid = createGrid(6, 6);
    expect(canPlace(grid, MACKA, 0, 0, "across")).toBe(true);
  });
});

describe("placeWord writes and reads back", () => {
  it("writes graphemes along an across run", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, MACKA, 1, 0, "across");
    expect(cellAt(grid, 1, 0)).toBe("M");
    expect(cellAt(grid, 1, 1)).toBe("A");
    expect(cellAt(grid, 1, 2)).toBe("Č");
    expect(cellAt(grid, 1, 3)).toBe("K");
    expect(cellAt(grid, 1, 4)).toBe("A");
    expect(cellAt(grid, 1, 5)).toBeNull();
  });

  it("writes graphemes along a down run", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, ["P", "A", "S"], 0, 3, "down");
    expect(cellAt(grid, 0, 3)).toBe("P");
    expect(cellAt(grid, 1, 3)).toBe("A");
    expect(cellAt(grid, 2, 3)).toBe("S");
  });

  it("records the placed word metadata", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, MACKA, 2, 1, "across");
    expect(grid.words).toEqual([
      {
        graphemes: MACKA,
        row: 2,
        col: 1,
        dir: "across",
        length: 5,
      },
    ]);
  });

  it("does not mutate the input grid (immutability)", () => {
    const original = createGrid(6, 6);
    const next = placeWord(original, MACKA, 0, 0, "across");
    expect(next).not.toBe(original);
    // Original stays empty with no words.
    expect(cellAt(original, 0, 0)).toBeNull();
    expect(cellAt(original, 0, 4)).toBeNull();
    expect(original.words).toEqual([]);
    // The new grid has the word.
    expect(cellAt(next, 0, 0)).toBe("M");
  });

  it("throws when placement is not legal", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, MACKA, 0, 0, "across");
    expect(() => placeWord(grid, ["X", "Y", "Z"], 0, 2, "down")).toThrow();
    expect(() => placeWord(grid, ["A", "B"], 0, 5, "across")).toThrow();
  });
});

describe("intersections", () => {
  it("places a down word crossing the Č of MAČKA", () => {
    let grid = createGrid(6, 6);
    grid = placeWord(grid, MACKA, 0, 0, "across"); // Č at (0,2)
    // Down word whose middle cell is the shared Č at (0,2).
    // Start one row above? No — start at row 0 so first cell is the Č.
    const down = ["Č", "E", "K"];
    expect(canPlace(grid, down, 0, 2, "down")).toBe(true);
    grid = placeWord(grid, down, 0, 2, "down");
    // Shared cell still holds Č.
    expect(cellAt(grid, 0, 2)).toBe("Č");
    // Rest of the down word written.
    expect(cellAt(grid, 1, 2)).toBe("E");
    expect(cellAt(grid, 2, 2)).toBe("K");
    // Both words recorded.
    expect(grid.words).toHaveLength(2);
  });

  it("supports a crossing where the shared cell is in the middle of both words", () => {
    let grid = createGrid(6, 6);
    // Across word K-A-Č-K-A would be odd; use a clean example.
    grid = placeWord(grid, ["R", "A", "K"], 2, 1, "across"); // R(2,1) A(2,2) K(2,3)
    // Down word sharing the A at (2,2): I-A-V vertically through col 2.
    const down = ["I", "A", "V"];
    expect(canPlace(grid, down, 1, 2, "down")).toBe(true);
    grid = placeWord(grid, down, 1, 2, "down");
    expect(cellAt(grid, 1, 2)).toBe("I");
    expect(cellAt(grid, 2, 2)).toBe("A");
    expect(cellAt(grid, 3, 2)).toBe("V");
  });
});

describe("digraph cells", () => {
  it("treats a digraph grapheme as a single cell", () => {
    let grid = createGrid(6, 6);
    // KONJI -> graphemes K O NJ I (NJ is one cell)
    const konji = ["K", "O", "NJ", "I"];
    grid = placeWord(grid, konji, 0, 0, "across");
    expect(cellAt(grid, 0, 0)).toBe("K");
    expect(cellAt(grid, 0, 1)).toBe("O");
    expect(cellAt(grid, 0, 2)).toBe("NJ");
    expect(cellAt(grid, 0, 3)).toBe("I");
    // Only 4 cells occupied, not 5.
    expect(cellAt(grid, 0, 4)).toBeNull();
  });

  it("crosses a digraph cell only with a matching digraph grapheme", () => {
    let grid = createGrid(6, 6);
    const konji = ["K", "O", "NJ", "I"];
    grid = placeWord(grid, konji, 0, 0, "across"); // NJ at (0,2)
    // A crossing down word with a plain "N" at the shared cell must fail.
    expect(canPlace(grid, ["N", "A", "D"], 0, 2, "down")).toBe(false);
    // A crossing down word with "NJ" at the shared cell succeeds.
    expect(canPlace(grid, ["NJ", "A", "D"], 0, 2, "down")).toBe(true);
    grid = placeWord(grid, ["NJ", "A", "D"], 0, 2, "down");
    expect(cellAt(grid, 0, 2)).toBe("NJ");
    expect(cellAt(grid, 1, 2)).toBe("A");
  });
});

describe("type export", () => {
  it("exposes the Grid type shape", () => {
    const grid: Grid = createGrid(2, 2);
    expect(grid.cells.length).toBe(4);
  });
});
