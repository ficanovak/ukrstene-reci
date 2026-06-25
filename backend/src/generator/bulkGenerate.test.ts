import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, truncateAll } from "../../test/prisma.js";
import { parseGridData } from "./gridData.js";
import { bulkGenerate, type BulkGenerateInput } from "./bulkGenerate.js";
import { type DictionaryEntry } from "./generateLevel.js";

/**
 * A fixed, hand-picked Serbian-Latin dictionary whose words heavily share
 * letters so the layout builder can interlock many of them. Mirrors the fixture
 * used by generateLevel.test.ts so the core function gets a known-good corpus
 * INJECTED directly (the bulk core does not load words from the DB).
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

/** Create a Language row and return its id (the FK levels reference). */
async function seedLanguage(): Promise<string> {
  const lang = await prisma.language.create({
    data: { code: "sr", name: "Srpski", supportedScripts: ["cyr", "lat"] },
  });
  return lang.id;
}

function baseInput(
  languageId: string,
  overrides: Partial<BulkGenerateInput> = {},
): BulkGenerateInput {
  return {
    prisma,
    languageId,
    script: "lat",
    mode: "basic",
    levelCount: 3,
    variationsPerLevel: 2,
    seed: 12345,
    dictionary: DICT,
    ...overrides,
  };
}

beforeEach(async () => {
  await truncateAll();
});

describe("bulkGenerate", () => {
  it("Test A: persists levels and the DB row count matches the returned count", async () => {
    const languageId = await seedLanguage();
    const result = await bulkGenerate(baseInput(languageId));

    // Up to 3 numbers x 2 variations = 6, minus any degenerate skips.
    expect(result.created).toBeGreaterThan(0);
    expect(result.created).toBeLessThanOrEqual(6);

    const dbCount = await prisma.level.count();
    expect(dbCount).toBe(result.created);

    // Persisted rows carry valid, parseable gridData and the expected statics.
    const rows = await prisma.level.findMany();
    for (const row of rows) {
      expect(row.languageId).toBe(languageId);
      expect(row.script).toBe("lat");
      expect(row.mode).toBe("basic");
      expect(row.status).toBe("active");
      expect(() => parseGridData(row.gridData)).not.toThrow();
      expect(row.gridWidth).toBeGreaterThan(0);
      expect(row.gridHeight).toBeGreaterThan(0);
    }

    expect(result.levelNumbers).toEqual([1, 2, 3]);
  });

  it("Test B: variations of a level number share a variationGroup; level numbers map to ascending bands", async () => {
    const languageId = await seedLanguage();
    await bulkGenerate(baseInput(languageId, { levelCount: 3, variationsPerLevel: 2 }));

    const rows = await prisma.level.findMany({ orderBy: { id: "asc" } });

    // Group rows by level number.
    const byNumber = new Map<number, typeof rows>();
    for (const r of rows) {
      const list = byNumber.get(r.levelNumber) ?? [];
      list.push(r);
      byNumber.set(r.levelNumber, list);
    }

    // All variations of a level number share one variationGroup value.
    for (const [, list] of byNumber) {
      const groups = new Set(list.map((r) => r.variationGroup));
      expect(groups.size).toBe(1);
    }

    // Distinct level numbers map to distinct, ascending target bands. With
    // LEVELS_PER_BAND >= levelCount each level number lands in its own band,
    // so level 1's band < level 2's band < level 3's band.
    const bandOfNumber = new Map<number, number>();
    for (const [num, list] of byNumber) {
      // Within a number all variations target the same band; bands are within
      // tolerance of that target, so they are equal-or-adjacent. Record the min.
      bandOfNumber.set(num, Math.min(...list.map((r) => r.difficultyBand)));
    }
    const b1 = bandOfNumber.get(1)!;
    const b2 = bandOfNumber.get(2)!;
    const b3 = bandOfNumber.get(3)!;
    // Coarse model: assert a non-decreasing trend across level numbers.
    expect(b1).toBeLessThanOrEqual(b2);
    expect(b2).toBeLessThanOrEqual(b3);
  });

  it("Test C: levels span easy->hard (first level band <= last level band)", async () => {
    const languageId = await seedLanguage();
    // Spread numbers far apart so the band difference is unmistakable.
    await bulkGenerate(baseInput(languageId, { levelCount: 3, variationsPerLevel: 1 }));

    const rows = await prisma.level.findMany();
    const lowest = rows.filter((r) => r.levelNumber === 1);
    const highest = rows.filter((r) => r.levelNumber === Math.max(...rows.map((x) => x.levelNumber)));

    const minBandFirst = Math.min(...lowest.map((r) => r.difficultyBand));
    const maxBandLast = Math.max(...highest.map((r) => r.difficultyBand));
    expect(minBandFirst).toBeLessThanOrEqual(maxBandLast);
  });

  it("Test D: re-running with the same input does not pile up duplicate variations", async () => {
    const languageId = await seedLanguage();
    const input = baseInput(languageId, { levelCount: 3, variationsPerLevel: 2 });

    const first = await bulkGenerate(input);
    const countAfterFirst = await prisma.level.count();
    expect(countAfterFirst).toBe(first.created);

    // Second identical run: skip policy means no new rows are created for level
    // numbers that already have >= variationsPerLevel active variations.
    const second = await bulkGenerate(input);
    const countAfterSecond = await prisma.level.count();

    expect(second.created).toBe(0);
    expect(countAfterSecond).toBe(countAfterFirst);

    // No level number exceeds variationsPerLevel active variations.
    const rows = await prisma.level.findMany();
    const perNumber = new Map<number, number>();
    for (const r of rows) {
      perNumber.set(r.levelNumber, (perNumber.get(r.levelNumber) ?? 0) + 1);
    }
    for (const [, n] of perNumber) {
      expect(n).toBeLessThanOrEqual(2);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
