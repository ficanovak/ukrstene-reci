import { describe, expect, it } from "vitest";

import {
  GridDataSchema,
  parseGridData,
  serializeGridData,
  type GridData,
} from "./gridData.js";
import type { Layout, LayoutWord } from "./layout.js";

/**
 * Build a synthetic LayoutWord with a consistent clue cell (matching the
 * skandinavka geometry: across → left of first letter, down → above it).
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

/**
 * Build a Layout whose `cells` array is consistent with the words: every
 * letter cell holds its grapheme, every other cell is null. This mirrors what
 * `buildLayout` produces, so the serializer is exercised against realistic
 * input.
 */
function makeLayout(
  width: number,
  height: number,
  words: LayoutWord[],
): Layout {
  const cells = new Array<string | null>(width * height).fill(null);
  for (const w of words) {
    const dRow = w.dir === "down" ? 1 : 0;
    const dCol = w.dir === "across" ? 1 : 0;
    for (let i = 0; i < w.graphemes.length; i++) {
      const r = w.row + dRow * i;
      const c = w.col + dCol * i;
      cells[r * width + c] = w.graphemes[i];
    }
  }
  return { width, height, words, cells };
}

/**
 * A small but representative crossing layout:
 *   - "MAČKA" across at row 2, col 1 (clue cell at (2,0)).
 *   - "MAMA" down at row 2, col 1 (clue cell at (1,1)), sharing the 'M' at (2,1).
 * 6x6 grid leaves blank filler cells, exercising all three cell kinds.
 */
function crossingLayout(): Layout {
  const across = makeWord(["M", "A", "Č", "K", "A"], 2, 1, "across");
  const down = makeWord(["M", "A", "M", "A"], 2, 1, "down");
  return makeLayout(6, 6, [across, down]);
}

describe("serializeGridData", () => {
  it("produces output that validates against GridDataSchema", () => {
    const data = serializeGridData(crossingLayout());
    expect(() => GridDataSchema.parse(data)).not.toThrow();
    // parseGridData should succeed and deep-equal the serializer output.
    expect(parseGridData(data)).toEqual(data);
  });

  it("carries the correct width and height", () => {
    const data = serializeGridData(crossingLayout());
    expect(data.width).toBe(6);
    expect(data.height).toBe(6);
  });

  it("emits exactly one cell entry per grid cell", () => {
    const data = serializeGridData(crossingLayout());
    expect(data.cells).toHaveLength(6 * 6);
  });

  it("classifies each cell as letter, clue, or blank", () => {
    const data = serializeGridData(crossingLayout());

    const at = (row: number, col: number) =>
      data.cells.find((c) => c.row === row && c.col === col);

    // Letter cell carries the solution grapheme.
    const letter = at(2, 1);
    expect(letter?.kind).toBe("letter");
    if (letter?.kind === "letter") {
      expect(letter.solution).toBe("M");
      // Belongs to both words (the intersection cell).
      expect(letter.words.length).toBe(2);
    }

    // Clue cell for the across word sits at (2,0) and arrows "across".
    const clueAcross = at(2, 0);
    expect(clueAcross?.kind).toBe("clue");
    if (clueAcross?.kind === "clue") {
      expect(clueAcross.dir).toBe("across");
      expect(typeof clueAcross.clueId).toBe("string");
    }

    // Clue cell for the down word sits at (1,1) and arrows "down".
    const clueDown = at(1, 1);
    expect(clueDown?.kind).toBe("clue");
    if (clueDown?.kind === "clue") {
      expect(clueDown.dir).toBe("down");
    }

    // A filler cell with no letter or clue is blank.
    const blank = at(0, 0);
    expect(blank?.kind).toBe("blank");
  });

  it("emits one word per answer with coordinates, direction, solution and clue reference", () => {
    const data = serializeGridData(crossingLayout());
    expect(data.words).toHaveLength(2);

    const acrossWord = data.words.find((w) => w.dir === "across");
    expect(acrossWord).toBeDefined();
    expect(acrossWord?.solution).toEqual(["M", "A", "Č", "K", "A"]);
    expect(acrossWord?.cells).toEqual([
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ]);
    expect(acrossWord?.clueCell).toEqual({ row: 2, col: 0 });
    expect(typeof acrossWord?.clueId).toBe("string");

    const downWord = data.words.find((w) => w.dir === "down");
    expect(downWord?.solution).toEqual(["M", "A", "M", "A"]);
    expect(downWord?.clueCell).toEqual({ row: 1, col: 1 });
  });

  it("emits a clue entry per word, keyed by the word's clueId", () => {
    const data = serializeGridData(crossingLayout());
    // One clue per word.
    expect(Object.keys(data.clues)).toHaveLength(2);
    for (const w of data.words) {
      expect(data.clues[w.clueId]).toBeDefined();
      // Default placeholder clues are text-typed.
      expect(data.clues[w.clueId].type).toBe("text");
    }
  });

  it("links each letter cell back to its word(s) and position for intersections", () => {
    const data = serializeGridData(crossingLayout());
    const at = (row: number, col: number) =>
      data.cells.find((c) => c.row === row && c.col === col);

    const intersection = at(2, 1);
    if (intersection?.kind === "letter") {
      const wordIds = intersection.words.map((m) => m.wordId).sort();
      expect(wordIds.length).toBe(2);
      // Each membership records the index within that word.
      for (const m of intersection.words) {
        expect(typeof m.wordId).toBe("string");
        expect(typeof m.index).toBe("number");
      }
    }
  });

  it("accepts injected clue content via meta keyed by wordId", () => {
    const layout = crossingLayout();
    // wordId is deterministic (assigned in word order: w0, w1...).
    const data = serializeGridData(layout, {
      clues: {
        w0: { type: "text", text: "Domaća životinja koja mjauče" },
        w1: { type: "image", imageRef: "img/mama.png", personalityRef: "deda" },
      },
    });
    const acrossWord = data.words.find((w) => w.dir === "across");
    const downWord = data.words.find((w) => w.dir === "down");
    expect(data.clues[acrossWord!.clueId]).toEqual({
      type: "text",
      text: "Domaća životinja koja mjauče",
    });
    expect(data.clues[downWord!.clueId]).toEqual({
      type: "image",
      imageRef: "img/mama.png",
      personalityRef: "deda",
    });
  });
});

describe("round-trip through real JSON", () => {
  it("survives JSON.stringify -> JSON.parse -> parseGridData", () => {
    const data = serializeGridData(crossingLayout());
    const roundTripped = parseGridData(
      JSON.parse(JSON.stringify(data)) as unknown,
    );
    expect(roundTripped).toEqual(data);
  });

  it("round-trips an empty (wordless) layout", () => {
    const empty: Layout = makeLayout(6, 6, []);
    const data = serializeGridData(empty);
    expect(data.words).toHaveLength(0);
    expect(Object.keys(data.clues)).toHaveLength(0);
    expect(data.cells.every((c) => c.kind === "blank")).toBe(true);
    const roundTripped = parseGridData(
      JSON.parse(JSON.stringify(data)) as unknown,
    );
    expect(roundTripped).toEqual(data);
  });
});

describe("digraph handling", () => {
  it("serializes a digraph grapheme as a single cell and round-trips", () => {
    // "NJEGA" where NJ is one grapheme → 4 letter cells, not 5.
    const word = makeWord(["NJ", "E", "G", "A"], 3, 1, "across");
    const layout = makeLayout(7, 7, [word]);
    const data = serializeGridData(layout);

    const at = (row: number, col: number) =>
      data.cells.find((c) => c.row === row && c.col === col);

    const first = at(3, 1);
    expect(first?.kind).toBe("letter");
    if (first?.kind === "letter") {
      expect(first.solution).toBe("NJ");
    }

    const w = data.words[0];
    expect(w.solution).toEqual(["NJ", "E", "G", "A"]);
    expect(w.cells).toHaveLength(4);

    const roundTripped = parseGridData(
      JSON.parse(JSON.stringify(data)) as unknown,
    );
    expect(roundTripped).toEqual(data);
    const rtFirst = roundTripped.cells.find((c) => c.row === 3 && c.col === 1);
    if (rtFirst?.kind === "letter") {
      expect(rtFirst.solution).toBe("NJ");
    }
  });
});

describe("parseGridData rejects malformed input", () => {
  it("throws when width is missing", () => {
    const data: Record<string, unknown> = {
      ...serializeGridData(crossingLayout()),
    };
    delete data.width;
    expect(() => parseGridData(data)).toThrow();
  });

  it("throws when a cell has an invalid kind", () => {
    const data = serializeGridData(crossingLayout()) as GridData;
    const broken = JSON.parse(JSON.stringify(data)) as {
      cells: { kind: string }[];
    };
    broken.cells[0].kind = "wormhole";
    expect(() => parseGridData(broken)).toThrow();
  });

  it("throws on a completely unrelated object", () => {
    expect(() => parseGridData({ hello: "world" })).toThrow();
    expect(() => parseGridData(null)).toThrow();
    expect(() => parseGridData("not an object")).toThrow();
  });
});
