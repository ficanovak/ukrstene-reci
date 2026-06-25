import { describe, expect, it } from "vitest";

import { cyrToLat, latToCyr } from "./translit.js";

describe("latToCyr", () => {
  it("converts an all-caps LJ digraph word", () => {
    expect(latToCyr("LJUBAV")).toBe("ЉУБАВ");
  });

  it("converts an all-caps DŽ digraph word", () => {
    expect(latToCyr("DŽEZVA")).toBe("ЏЕЗВА");
  });

  it("converts the special single letters Č, Š", () => {
    expect(latToCyr("ČAŠA")).toBe("ЧАША");
  });

  it("greedily consumes title-case Nj before single letters", () => {
    expect(latToCyr("Njegoš")).toBe("Његош");
  });

  it("converts lower-case digraphs", () => {
    expect(latToCyr("ljubav")).toBe("љубав");
    expect(latToCyr("njegoš")).toBe("његош");
    expect(latToCyr("džezva")).toBe("џезва");
  });

  it("passes through non-alphabet characters unchanged", () => {
    expect(latToCyr("A-B C1")).toBe("А-Б Ц1");
  });
});

describe("cyrToLat", () => {
  it("converts an all-caps word with the NJ digraph", () => {
    expect(cyrToLat("ЊЕГОШ")).toBe("NJEGOŠ");
  });

  it("converts an all-caps word with the LJ digraph", () => {
    expect(cyrToLat("ЉУБАВ")).toBe("LJUBAV");
  });

  it("converts the special single letter Ђ", () => {
    expect(cyrToLat("ЂАК")).toBe("ĐAK");
  });

  it("renders a title-case Cyrillic digraph as title case (Њ -> Nj)", () => {
    expect(cyrToLat("Његош")).toBe("Njegoš");
  });

  it("renders a lower-case Cyrillic digraph as lower case (џ -> dž)", () => {
    expect(cyrToLat("џезва")).toBe("džezva");
  });

  it("renders a standalone uppercase digraph followed by lowercase as title case", () => {
    expect(cyrToLat("Љута")).toBe("Ljuta");
  });

  it("passes through non-alphabet characters unchanged", () => {
    expect(cyrToLat("А-Б Ц1")).toBe("A-B C1");
  });
});

describe("round-trip stability (uppercase, crossword storage)", () => {
  const cyrWords = [
    "ЉУБАВ",
    "ЊЕГОШ",
    "ЏЕЗВА",
    "ЂАК",
    "ЖАБА",
    "ЋЕВАП",
    "ЧАША",
    "ШЕШИР",
    "ЂУРЂЕВДАН",
    "ЏУНГЛА",
    "ЊУШКА",
  ];

  for (const cyr of cyrWords) {
    it(`cyr -> lat -> cyr is stable for ${cyr}`, () => {
      expect(latToCyr(cyrToLat(cyr))).toBe(cyr);
    });
  }

  const latWords = [
    "LJUBAV",
    "NJEGOŠ",
    "DŽEZVA",
    "ĐAK",
    "ŽABA",
    "ĆEVAP",
    "ČAŠA",
    "ŠEŠIR",
    "ĐURĐEVDAN",
    "DŽUNGLA",
    "NJUŠKA",
  ];

  for (const lat of latWords) {
    it(`lat -> cyr -> lat is stable for ${lat}`, () => {
      expect(cyrToLat(latToCyr(lat))).toBe(lat);
    });
  }
});
