import { describe, expect, it } from "vitest";

import { bandOf, NUM_BANDS } from "./difficulty.js";
import { parseGridData, type Clue } from "./gridData.js";
import {
  generateLevel,
  type DictionaryEntry,
  type GenerateLevelInput,
} from "./generateLevel.js";

/**
 * A fixed, hand-picked Serbian-Latin dictionary whose words heavily share
 * letters so the layout builder can interlock many of them. Frequencies are on
 * a normalized [0,1] scale (1 = very common, 0 = very rare) — the documented
 * scale this pipeline expects. Each entry carries a simple text clue so we can
 * assert real clue injection.
 */
const DICT: DictionaryEntry[] = [
  { word: "RAK", frequency: 0.8, clue: { type: "text", text: "morski stvor" } },
  { word: "MAK", frequency: 0.7, clue: { type: "text", text: "crveni cvet" } },
  { word: "RANA", frequency: 0.6, clue: { type: "text", text: "povreda" } },
  { word: "KAVA", frequency: 0.5, clue: { type: "text", text: "napitak" } },
  { word: "MAMA", frequency: 0.9, clue: { type: "text", text: "majka" } },
  { word: "RAME", frequency: 0.55, clue: { type: "text", text: "deo tela" } },
  { word: "MORE", frequency: 0.65, clue: { type: "text", text: "velika voda" } },
  { word: "KORA", frequency: 0.5, clue: { type: "text", text: "spoljni sloj" } },
  { word: "ROMAN", frequency: 0.45, clue: { type: "text", text: "knjiga" } },
  { word: "MAJKA", frequency: 0.85, clue: { type: "text", text: "roditelj" } },
  { word: "KAMEN", frequency: 0.6, clue: { type: "text", text: "tvrd predmet" } },
  { word: "MARAMA", frequency: 0.4, clue: { type: "text", text: "tkanina za glavu" } },
  { word: "AKADEMIK", frequency: 0.2, clue: { type: "text", text: "clan akademije" } },
  { word: "NARAMAK", frequency: 0.15, clue: { type: "text", text: "snop u rukama" } },
  { word: "KARAMELA", frequency: 0.3, clue: { type: "text", text: "slatkis" } },
];

function baseInput(overrides: Partial<GenerateLevelInput> = {}): GenerateLevelInput {
  return {
    languageId: "sr",
    script: "lat",
    mode: "basic",
    targetBand: 9,
    seed: 12345,
    dictionary: DICT,
    ...overrides,
  };
}

describe("generateLevel", () => {
  it("returns a non-null result whose band is within ±1 of the target", () => {
    // Band 9 is achievable for this dense, heavily-interlocking dictionary on
    // the band-9 grid; the retry loop should hit it within tolerance.
    const target = 9;
    const result = generateLevel(baseInput({ targetBand: target, seed: 7 }));
    expect(result).not.toBeNull();
    expect(Math.abs(result!.difficultyBand - target)).toBeLessThanOrEqual(1);
    // The reported band must be the band of the reported coefficient.
    expect(result!.difficultyBand).toBe(bandOf(result!.difficultyCoefficient));
  });

  it("produces gridData that validates against the schema", () => {
    const result = generateLevel(baseInput({ seed: 99 }));
    expect(result).not.toBeNull();
    // Round-trips through JSON (DB/network contract) and parses cleanly.
    const roundTripped = JSON.parse(JSON.stringify(result!.gridData));
    expect(() => parseGridData(roundTripped)).not.toThrow();
  });

  it("keeps grid dimensions within project limits", () => {
    for (let band = 1; band <= NUM_BANDS; band++) {
      const result = generateLevel(baseInput({ targetBand: band, seed: 100 + band }));
      expect(result).not.toBeNull();
      expect(result!.gridWidth).toBeGreaterThanOrEqual(6);
      expect(result!.gridWidth).toBeLessThanOrEqual(9);
      expect(result!.gridHeight).toBeGreaterThanOrEqual(6);
      expect(result!.gridHeight).toBeLessThanOrEqual(12);
    }
  });

  it("honours explicitly provided dimensions", () => {
    const result = generateLevel(baseInput({ width: 7, height: 9, seed: 3 }));
    expect(result).not.toBeNull();
    expect(result!.gridWidth).toBe(7);
    expect(result!.gridHeight).toBe(9);
    expect(result!.gridData.width).toBe(7);
    expect(result!.gridData.height).toBe(9);
  });

  it("is deterministic: identical input ⇒ deep-equal result", () => {
    const a = generateLevel(baseInput({ seed: 4242 }));
    const b = generateLevel(baseInput({ seed: 4242 }));
    expect(a).toEqual(b);
  });

  it("injects the real dictionary clues for placed words (no placeholders)", () => {
    const result = generateLevel(baseInput({ seed: 11 }));
    expect(result).not.toBeNull();
    const { gridData } = result!;
    // Map word solution-string → its expected clue from the dictionary.
    const clueByWord = new Map<string, Clue>(
      DICT.map((e) => [e.word, e.clue]),
    );
    expect(gridData.words.length).toBeGreaterThan(0);
    for (const word of gridData.words) {
      const solutionStr = word.solution.join("");
      const expectedClue = clueByWord.get(solutionStr);
      expect(expectedClue, `no dict entry for ${solutionStr}`).toBeDefined();
      const actualClue = gridData.clues[word.clueId];
      expect(actualClue).toEqual(expectedClue);
      // Definitely not the serializer placeholder.
      expect(actualClue).not.toEqual({ type: "text", text: "" });
    }
  });

  it("carries the passthrough metadata fields", () => {
    const result = generateLevel(
      baseInput({ mode: "advanced", languageId: "sr", script: "lat", seed: 8 }),
    );
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("advanced");
    expect(result!.languageId).toBe("sr");
    expect(result!.script).toBe("lat");
  });

  it("returns null for a degenerate dictionary that cannot interlock", () => {
    // Single word that is wider than any allowed grid leaves no room for a clue
    // column, so no seed (and hence no words) can be placed ⇒ null.
    const degenerate: DictionaryEntry[] = [
      {
        word: "ABVGDEZIJKLMNOPRS",
        frequency: 0.5,
        clue: { type: "text", text: "predugacka rec" },
      },
    ];
    const result = generateLevel(baseInput({ dictionary: degenerate, seed: 1 }));
    expect(result).toBeNull();
  });

  it("returns null for an empty dictionary without throwing", () => {
    expect(() => generateLevel(baseInput({ dictionary: [] }))).not.toThrow();
    expect(generateLevel(baseInput({ dictionary: [] }))).toBeNull();
  });

  it("different seeds can produce different but individually valid levels", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const signatures = new Set<string>();
    for (const seed of seeds) {
      const result = generateLevel(baseInput({ seed }));
      expect(result).not.toBeNull();
      // Each is internally valid.
      expect(() => parseGridData(JSON.parse(JSON.stringify(result!.gridData)))).not.toThrow();
      // Signature of placed words (order-independent) to detect variation.
      const sig = result!.gridData.words
        .map((w) => `${w.solution.join("")}@${w.cells[0].row},${w.cells[0].col},${w.dir}`)
        .sort()
        .join("|");
      signatures.add(sig);
    }
    // At least two distinct layouts across the seed sweep.
    expect(signatures.size).toBeGreaterThan(1);
  });
});
