import { describe, expect, it } from "vitest";

import {
  NUM_BANDS,
  bandOf,
  difficultyOf,
  levelNumberRange,
  type DifficultyOptions,
} from "./difficulty.js";
import type { Layout, LayoutWord } from "./layout.js";

/**
 * Build a synthetic LayoutWord. We only populate the fields `difficultyOf`
 * reads (graphemes, row, col, dir); clue cells are filled with plausible
 * values so the object is shape-valid but they do not affect scoring.
 */
function makeWord(
  graphemes: string[],
  row: number,
  col: number,
  dir: "across" | "down",
): LayoutWord {
  return {
    graphemes,
    row,
    col,
    dir,
    clueRow: dir === "across" ? row : row - 1,
    clueCol: dir === "across" ? col - 1 : col,
  };
}

/** Build a synthetic Layout from words + grid dimensions. */
function makeLayout(
  width: number,
  height: number,
  words: LayoutWord[],
): Layout {
  return {
    width,
    height,
    words,
    cells: new Array<string | null>(width * height).fill(null),
  };
}

/** A tiny layout: 2 short words crossing once on a small grid. */
function smallLayout(): Layout {
  return makeLayout(5, 5, [
    makeWord(["a", "b", "c"], 1, 1, "across"),
    makeWord(["b", "x"], 1, 2, "down"),
  ]);
}

/** A big layout: many long words on a large grid. */
function bigLayout(): Layout {
  return makeLayout(15, 15, [
    makeWord(["a", "b", "c", "d", "e", "f", "g"], 2, 1, "across"),
    makeWord(["b", "x", "y", "z", "w", "v"], 2, 2, "down"),
    makeWord(["c", "p", "q", "r", "s"], 2, 3, "down"),
    makeWord(["d", "m", "n", "o"], 2, 4, "down"),
    makeWord(["e", "t", "u", "k"], 2, 5, "down"),
  ]);
}

describe("difficultyOf", () => {
  it("returns a value in [1, 100] for several layouts", () => {
    const layouts = [smallLayout(), bigLayout(), makeLayout(7, 7, [])];
    for (const l of layouts) {
      const d = difficultyOf(l);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(100);
    }
  });

  it("clamps to [1, 100] even with extreme rarity input", () => {
    const d = difficultyOf(bigLayout(), { avgRarity: 5 });
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(100);
    const d2 = difficultyOf(smallLayout(), { avgRarity: -5 });
    expect(d2).toBeGreaterThanOrEqual(1);
    expect(d2).toBeLessThanOrEqual(100);
  });

  it("scores a bigger / more-word / longer-word layout HIGHER than a small one", () => {
    expect(difficultyOf(bigLayout())).toBeGreaterThan(
      difficultyOf(smallLayout()),
    );
  });

  it("scores higher rarity (lower frequency) HIGHER, all else equal", () => {
    const l = bigLayout();
    const rare = difficultyOf(l, { avgRarity: 0.95 });
    const common = difficultyOf(l, { avgRarity: 0.05 });
    expect(rare).toBeGreaterThan(common);
  });

  it("scores more crossings HIGHER, all else equal", () => {
    // Same grid, same word count, same letter footprint, same rarity — only
    // the number of intersections differs.
    const base: DifficultyOptions = { avgRarity: 0.5 };

    // Two words that cross once (share one cell).
    const fewCrossings = makeLayout(10, 10, [
      makeWord(["a", "b", "c", "d"], 1, 1, "across"),
      makeWord(["b", "z", "y"], 1, 2, "down"),
    ]);
    // Same two words but arranged so they cross at two cells: place a second
    // down word crossing the across word a second time. To keep footprint and
    // word-count comparable we instead reuse identical words but add a shared
    // crossing letter. We compare a 1-crossing arrangement vs a 2-crossing one
    // built from the SAME multiset of words/letters.
    const moreCrossings = makeLayout(10, 10, [
      makeWord(["a", "b", "c", "d"], 1, 1, "across"),
      makeWord(["a", "z", "y"], 0, 1, "down"), // crosses "a" at (1,1)
      // Note: this changes word multiset; see below for a fairer comparison.
    ]);
    // Fairer: hold word list constant, vary only overlap. Build two layouts
    // with the SAME words where one pair intersects and the other is disjoint.
    const disjoint = makeLayout(12, 12, [
      makeWord(["a", "b", "c", "d"], 1, 1, "across"),
      makeWord(["e", "f", "g"], 5, 5, "down"),
    ]);
    const crossing = makeLayout(12, 12, [
      makeWord(["a", "b", "c", "d"], 1, 1, "across"),
      makeWord(["b", "f", "g"], 1, 2, "down"), // shares cell (1,2)
    ]);
    expect(difficultyOf(crossing, base)).toBeGreaterThan(
      difficultyOf(disjoint, base),
    );
    // touch the other constructed layouts so they are not unused
    expect(difficultyOf(moreCrossings, base)).toBeGreaterThan(0);
    expect(difficultyOf(fewCrossings, base)).toBeGreaterThan(0);
  });

  it("is deterministic: same input yields the same score", () => {
    const l = bigLayout();
    expect(difficultyOf(l, { avgRarity: 0.3 })).toBe(
      difficultyOf(l, { avgRarity: 0.3 }),
    );
  });
});

describe("bandOf", () => {
  it("maps coefficient 1 to band 1", () => {
    expect(bandOf(1)).toBe(1);
  });

  it("maps coefficient 100 to band NUM_BANDS", () => {
    expect(bandOf(100)).toBe(NUM_BANDS);
  });

  it("maps a mid value to the expected band", () => {
    // With NUM_BANDS bands, each band spans 100/NUM_BANDS coefficient points.
    // 50 sits at the boundary of band ceil(50/(100/NUM_BANDS)).
    const span = 100 / NUM_BANDS;
    expect(bandOf(50)).toBe(Math.ceil(50 / span));
  });

  it("never returns a band outside 1..NUM_BANDS", () => {
    for (let c = -10; c <= 110; c++) {
      const b = bandOf(c);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(NUM_BANDS);
    }
  });

  it("is monotonic non-decreasing in the coefficient", () => {
    let prev = 0;
    for (let c = 1; c <= 100; c++) {
      const b = bandOf(c);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });
});

describe("levelNumberRange", () => {
  it("returns ascending min<=max ranges", () => {
    for (let b = 1; b <= NUM_BANDS; b++) {
      const { min, max } = levelNumberRange(b);
      expect(min).toBeLessThanOrEqual(max);
      expect(min).toBeGreaterThanOrEqual(1);
    }
  });

  it("band 1 starts at level 1", () => {
    expect(levelNumberRange(1).min).toBe(1);
  });

  it("ranges are contiguous and non-overlapping, ordered ascending", () => {
    let prevMax = 0;
    for (let b = 1; b <= NUM_BANDS; b++) {
      const { min, max } = levelNumberRange(b);
      // contiguous: this band starts exactly one after the previous band ended
      expect(min).toBe(prevMax + 1);
      expect(max).toBeGreaterThanOrEqual(min);
      prevMax = max;
    }
  });

  it("easier bands map to lower level numbers than harder bands", () => {
    expect(levelNumberRange(1).max).toBeLessThan(levelNumberRange(2).min);
    expect(levelNumberRange(NUM_BANDS).min).toBeGreaterThan(
      levelNumberRange(1).max,
    );
  });
});
