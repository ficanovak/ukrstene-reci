import { describe, expect, it } from "vitest";

import { graphemeLength, splitGraphemes } from "./graphemes.js";

describe("splitGraphemes", () => {
  describe("Latin digraphs collapse to one cell", () => {
    it("treats NJ as a single grapheme", () => {
      expect(splitGraphemes("NJEGOŠ", "lat", "sr")).toEqual([
        "NJ",
        "E",
        "G",
        "O",
        "Š",
      ]);
    });

    it("uppercases mixed-case input before splitting LJ", () => {
      expect(splitGraphemes("ljubav", "lat", "hr")).toEqual([
        "LJ",
        "U",
        "B",
        "A",
        "V",
      ]);
    });

    it("treats DŽ as a single grapheme", () => {
      expect(splitGraphemes("DŽEZVA", "lat", "bs")).toEqual([
        "DŽ",
        "E",
        "Z",
        "V",
        "A",
      ]);
    });

    it("normalizes the precomposed Ǆ form to one DŽ cell", () => {
      // U+01C4 LATIN CAPITAL LETTER DZ WITH CARON
      expect(splitGraphemes("ǄEZVA", "lat", "bs")).toEqual([
        "DŽ",
        "E",
        "Z",
        "V",
        "A",
      ]);
    });
  });

  describe("Cyrillic digraphs are already single code points", () => {
    it("treats Љ as a single grapheme", () => {
      expect(splitGraphemes("ЉУБАВ", "cyr", "mk")).toEqual([
        "Љ",
        "У",
        "Б",
        "А",
        "В",
      ]);
    });

    it("treats Њ as a single grapheme", () => {
      expect(splitGraphemes("ЊЕГОШ", "cyr", "sr")).toEqual([
        "Њ",
        "Е",
        "Г",
        "О",
        "Ш",
      ]);
    });

    it("treats Џ as a single grapheme", () => {
      expect(splitGraphemes("ЏЕП", "cyr", "sr")).toEqual(["Џ", "Е", "П"]);
    });
  });

  describe("single special letters are never split", () => {
    it("keeps Latin Č as one cell with no false digraph", () => {
      expect(splitGraphemes("MAČKA", "lat", "sr")).toEqual([
        "M",
        "A",
        "Č",
        "K",
        "A",
      ]);
    });

    it("keeps Latin Š Đ Ć Ž as one cell each", () => {
      expect(splitGraphemes("ŠĐĆŽ", "lat", "sr")).toEqual(["Š", "Đ", "Ć", "Ž"]);
    });

    it("keeps Montenegrin Ś and Ź as single cells", () => {
      expect(splitGraphemes("ŚŹ", "lat", "me")).toEqual(["Ś", "Ź"]);
      expect(splitGraphemes("śutra", "lat", "me")).toEqual([
        "Ś",
        "U",
        "T",
        "R",
        "A",
      ]);
    });

    it("keeps Cyrillic special letters as single cells", () => {
      expect(splitGraphemes("ШЂЧЋЖЅЃЌ", "cyr", "mk")).toEqual([
        "Ш",
        "Ђ",
        "Ч",
        "Ћ",
        "Ж",
        "Ѕ",
        "Ѓ",
        "Ќ",
      ]);
    });
  });

  describe("no false digraph when constituent letters are not adjacent", () => {
    it("keeps D and Ž separate when not adjacent", () => {
      expect(splitGraphemes("DUŽ", "lat", "sr")).toEqual(["D", "U", "Ž"]);
    });

    it("keeps N and J separate when not adjacent", () => {
      expect(splitGraphemes("NABOJ", "lat", "sr")).toEqual([
        "N",
        "A",
        "B",
        "O",
        "J",
      ]);
    });
  });

  describe("edge cases", () => {
    it("returns an empty array for an empty string", () => {
      expect(splitGraphemes("", "lat", "sr")).toEqual([]);
    });

    it("handles a trailing lone D before a non-Ž letter", () => {
      expect(splitGraphemes("DA", "lat", "sr")).toEqual(["D", "A"]);
    });

    it("collapses consecutive digraphs", () => {
      expect(splitGraphemes("NJNJ", "lat", "sr")).toEqual(["NJ", "NJ"]);
    });
  });
});

describe("graphemeLength", () => {
  it("counts a digraph as one cell", () => {
    expect(graphemeLength("NJEGOŠ", "lat", "sr")).toBe(5);
  });

  it("counts plain letters", () => {
    expect(graphemeLength("MAČKA", "lat", "sr")).toBe(5);
  });

  it("counts Cyrillic single-codepoint digraphs as one cell", () => {
    expect(graphemeLength("ЉУБАВ", "cyr", "mk")).toBe(5);
  });
});
