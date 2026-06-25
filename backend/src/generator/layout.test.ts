import { describe, expect, it } from "vitest";

import { splitGraphemes } from "./graphemes.js";
import { buildLayout, type Layout, type LayoutWord } from "./layout.js";
import { makeRng } from "./rng.js";

/**
 * A small, hand-picked fixed dictionary of Serbian-Latin words chosen so they
 * interlock on shared letters. Pre-split into grapheme arrays (all single-cell
 * letters here, no digraphs) for fully deterministic tests.
 *
 * Shared letters make crossings possible, e.g. MAČKA / KAPA share A and K,
 * RAK / KAPA share K and A, etc. Many words contain A, K, R, S, O.
 */
const DICTIONARY: { graphemes: string[] }[] = [
  { graphemes: ["M", "A", "Č", "K", "A"] }, // MAČKA (cat)
  { graphemes: ["K", "A", "P", "A"] }, // KAPA (cap)
  { graphemes: ["R", "A", "K"] }, // RAK (crab)
  { graphemes: ["S", "O", "K"] }, // SOK (juice)
  { graphemes: ["K", "O", "S", "A"] }, // KOSA (hair)
  { graphemes: ["A", "S"] }, // AS (ace)
  { graphemes: ["O", "K", "O"] }, // OKO (eye)
  { graphemes: ["R", "O", "S", "A"] }, // ROSA (dew)
];

const WIDTH = 7;
const HEIGHT = 9;

function build(seed: number): Layout {
  return buildLayout({
    width: WIDTH,
    height: HEIGHT,
    words: DICTIONARY,
    rng: makeRng(seed),
  });
}

/** Set of "row,col" keys for every letter cell occupied by `words`. */
function letterCellKeys(words: readonly LayoutWord[]): Set<string> {
  const keys = new Set<string>();
  for (const w of words) {
    for (let i = 0; i < w.graphemes.length; i++) {
      const r = w.dir === "down" ? w.row + i : w.row;
      const c = w.dir === "across" ? w.col + i : w.col;
      keys.add(`${r},${c}`);
    }
  }
  return keys;
}

/** All "row,col" cells of a single word. */
function cellsOf(w: LayoutWord): string[] {
  const out: string[] = [];
  for (let i = 0; i < w.graphemes.length; i++) {
    const r = w.dir === "down" ? w.row + i : w.row;
    const c = w.dir === "across" ? w.col + i : w.col;
    out.push(`${r},${c}`);
  }
  return out;
}

describe("buildLayout basic output", () => {
  it("returns the requested dimensions", () => {
    const layout = build(123);
    expect(layout.width).toBe(WIDTH);
    expect(layout.height).toBe(HEIGHT);
  });

  it("places at least two words (a meaningful, connected layout)", () => {
    const layout = build(123);
    expect(layout.words.length).toBeGreaterThanOrEqual(2);
  });

  it("exposes a resolved letter grid sized width*height", () => {
    const layout = build(123);
    expect(layout.cells.length).toBe(WIDTH * HEIGHT);
  });

  it("the resolved grid matches each placed word's letters", () => {
    const layout = build(123);
    for (const w of layout.words) {
      for (let i = 0; i < w.graphemes.length; i++) {
        const r = w.dir === "down" ? w.row + i : w.row;
        const c = w.dir === "across" ? w.col + i : w.col;
        expect(layout.cells[r * WIDTH + c]).toBe(w.graphemes[i]);
      }
    }
  });
});

describe("invariant: in-bounds", () => {
  it("keeps every letter cell inside the grid", () => {
    const layout = build(7);
    for (const w of layout.words) {
      for (let i = 0; i < w.graphemes.length; i++) {
        const r = w.dir === "down" ? w.row + i : w.row;
        const c = w.dir === "across" ? w.col + i : w.col;
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(HEIGHT);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(WIDTH);
      }
    }
  });

  it("keeps every clue cell inside the grid", () => {
    const layout = build(7);
    for (const w of layout.words) {
      expect(w.clueRow).toBeGreaterThanOrEqual(0);
      expect(w.clueRow).toBeLessThan(HEIGHT);
      expect(w.clueCol).toBeGreaterThanOrEqual(0);
      expect(w.clueCol).toBeLessThan(WIDTH);
    }
  });
});

describe("invariant: clue cells valid", () => {
  it("places each clue cell at the correct relative position", () => {
    const layout = build(99);
    for (const w of layout.words) {
      if (w.dir === "across") {
        expect(w.clueRow).toBe(w.row);
        expect(w.clueCol).toBe(w.col - 1);
      } else {
        expect(w.clueRow).toBe(w.row - 1);
        expect(w.clueCol).toBe(w.col);
      }
    }
  });

  it("never puts a clue cell on a letter cell of any answer", () => {
    const layout = build(99);
    const letters = letterCellKeys(layout.words);
    for (const w of layout.words) {
      expect(letters.has(`${w.clueRow},${w.clueCol}`)).toBe(false);
    }
  });

  it("never reuses the same clue cell for two answers", () => {
    const layout = build(99);
    const seen = new Set<string>();
    for (const w of layout.words) {
      const key = `${w.clueRow},${w.clueCol}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("invariant: connectivity", () => {
  it("every non-seed word shares at least one letter cell with another word", () => {
    const layout = build(123);
    expect(layout.words.length).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < layout.words.length; i++) {
      const mine = new Set(cellsOf(layout.words[i]));
      let crosses = false;
      for (let j = 0; j < layout.words.length; j++) {
        if (i === j) continue;
        for (const cell of cellsOf(layout.words[j])) {
          if (mine.has(cell)) {
            crosses = true;
            break;
          }
        }
        if (crosses) break;
      }
      // The seed (first placed) may be crossed by others; but with >=2 words
      // and greedy intersection placement, even the seed should be crossed.
      // We assert every word participates in at least one crossing.
      expect(crosses).toBe(true);
    }
  });

  it("contains at least one real crossing on an equal grapheme", () => {
    const layout = build(123);
    let found = false;
    for (let i = 0; i < layout.words.length && !found; i++) {
      const a = layout.words[i];
      const aCells = new Map<string, string>();
      for (let k = 0; k < a.graphemes.length; k++) {
        const r = a.dir === "down" ? a.row + k : a.row;
        const c = a.dir === "across" ? a.col + k : a.col;
        aCells.set(`${r},${c}`, a.graphemes[k]);
      }
      for (let j = 0; j < layout.words.length && !found; j++) {
        if (i === j) continue;
        const b = layout.words[j];
        for (let k = 0; k < b.graphemes.length; k++) {
          const r = b.dir === "down" ? b.row + k : b.row;
          const c = b.dir === "across" ? b.col + k : b.col;
          const key = `${r},${c}`;
          if (aCells.has(key)) {
            // shared cell must hold the same grapheme for both words
            expect(aCells.get(key)).toBe(b.graphemes[k]);
            found = true;
            break;
          }
        }
      }
    }
    expect(found).toBe(true);
  });
});

describe("invariant: determinism", () => {
  it("produces identical layouts for the same seed", () => {
    const a = build(123);
    const b = build(123);
    expect(a).toEqual(b);
  });

  it("produces identical layouts across several seeds", () => {
    for (const seed of [0, 1, 42, 777, 2024]) {
      expect(build(seed)).toEqual(build(seed));
    }
  });

  it("different seeds can produce different layouts", () => {
    // Not strictly guaranteed for every pair, but across a spread of seeds at
    // least one pair should differ, proving the RNG actually influences output.
    const layouts = [1, 2, 3, 4, 5].map((s) => JSON.stringify(build(s)));
    const distinct = new Set(layouts);
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("edge cases", () => {
  it("returns an empty-but-valid layout when given no words", () => {
    const layout = buildLayout({
      width: WIDTH,
      height: HEIGHT,
      words: [],
      rng: makeRng(1),
    });
    expect(layout.words).toEqual([]);
    expect(layout.cells.length).toBe(WIDTH * HEIGHT);
  });

  it("places the single word when given exactly one", () => {
    const layout = buildLayout({
      width: WIDTH,
      height: HEIGHT,
      words: [{ graphemes: ["K", "O", "S", "A"] }],
      rng: makeRng(1),
    });
    expect(layout.words).toHaveLength(1);
    // Its clue cell must be in-bounds and correctly positioned.
    const w = layout.words[0];
    if (w.dir === "across") {
      expect(w.clueCol).toBe(w.col - 1);
    } else {
      expect(w.clueRow).toBe(w.row - 1);
    }
    expect(w.clueRow).toBeGreaterThanOrEqual(0);
    expect(w.clueCol).toBeGreaterThanOrEqual(0);
  });

  it("terminates and stays deterministic on a larger grid", () => {
    const opts = {
      width: 9,
      height: 12,
      words: DICTIONARY,
      rng: makeRng(55),
    };
    const a = buildLayout({ ...opts, rng: makeRng(55) });
    const b = buildLayout({ ...opts, rng: makeRng(55) });
    expect(a).toEqual(b);
    expect(a.words.length).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty layout (no throw) when no seed fits", () => {
    // Every word is wider than width-1, so no seed can leave a clue column and
    // nothing can be placed. Must return an empty layout, not throw.
    const width = 5;
    const height = 7;
    const wide = [
      { graphemes: ["A", "B", "C", "D", "E"] }, // length 5 == width, needs 6
      { graphemes: ["F", "G", "H", "I", "J", "K"] }, // length 6 > width
    ];
    let layout: Layout | undefined;
    expect(() => {
      layout = buildLayout({ width, height, words: wide, rng: makeRng(3) });
    }).not.toThrow();
    expect(layout?.words.length).toBe(0);
    expect(layout?.cells.length).toBe(width * height);
  });
});

describe("digraphs (multi-char graphemes)", () => {
  // The whole module is built around one-grapheme-per-cell where a grapheme may
  // be a multi-code-point digraph like "NJ". These words share the digraph "NJ"
  // so they can cross ON that single cell, exercising the digraph path end to
  // end (split → place → cross → single-cell occupancy).
  const NJIVA = splitGraphemes("NJIVA", "lat", "sr"); // ["NJ","I","V","A"]
  const KONJ = splitGraphemes("KONJ", "lat", "sr"); // ["K","O","NJ"]

  it("splits the digraph into a single grapheme cell", () => {
    expect(NJIVA).toEqual(["NJ", "I", "V", "A"]);
    expect(KONJ).toEqual(["K", "O", "NJ"]);
  });

  it("crosses two words on a shared digraph cell, occupying one cell", () => {
    // Try a spread of seeds; with two words sharing exactly one grapheme (NJ)
    // any successful 2-word layout must cross on it.
    let crossed = false;
    for (const seed of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const layout = buildLayout({
        width: 8,
        height: 8,
        words: [{ graphemes: NJIVA }, { graphemes: KONJ }],
        rng: makeRng(seed),
      });
      if (layout.words.length < 2) continue;

      // Find the shared cell and assert both words place "NJ" there.
      const [a, b] = layout.words;
      const aCells = new Map<string, string>();
      for (let i = 0; i < a.graphemes.length; i++) {
        const r = a.dir === "down" ? a.row + i : a.row;
        const c = a.dir === "across" ? a.col + i : a.col;
        aCells.set(`${r},${c}`, a.graphemes[i]);
      }
      for (let i = 0; i < b.graphemes.length; i++) {
        const r = b.dir === "down" ? b.row + i : b.row;
        const c = b.dir === "across" ? b.col + i : b.col;
        const k = `${r},${c}`;
        if (aCells.has(k)) {
          // Shared cell holds the SAME grapheme for both, and it is the digraph.
          expect(aCells.get(k)).toBe(b.graphemes[i]);
          expect(b.graphemes[i]).toBe("NJ");
          // The resolved grid cell is exactly the digraph string (one cell).
          expect(layout.cells[r * layout.width + c]).toBe("NJ");
          crossed = true;
        }
      }
      if (crossed) break;
    }
    expect(crossed).toBe(true);
  });
});
