import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.js";

describe("makeRng", () => {
  it("returns a function producing numbers in [0, 1)", () => {
    const rng = makeRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic: same seed yields the same sequence", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds yield different sequences", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("produces a well-spread sequence (not stuck on a constant)", () => {
    const rng = makeRng(42);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) {
      values.add(rng());
    }
    // A healthy PRNG should not collapse to a handful of repeated values.
    expect(values.size).toBeGreaterThan(90);
  });

  it("accepts seed 0 and still produces varied output", () => {
    const rng = makeRng(0);
    const first = rng();
    const second = rng();
    expect(first).not.toBe(second);
  });
});
