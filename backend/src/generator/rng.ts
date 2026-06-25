/**
 * Deterministic seeded pseudo-random number generator.
 *
 * The layout builder (Task 2.4) and any later generation step that needs
 * randomness MUST use a seeded RNG so that the same inputs always yield the
 * same crossword. `Math.random` is therefore banned across the generator: it is
 * process-global and non-reproducible. Inject the function returned here instead.
 *
 * Implementation: mulberry32 — a tiny, fast 32-bit generator with a full 2^32
 * period and good statistical quality for this use (shuffling / tie-breaking,
 * not cryptography). It is self-contained and has no external state, so two
 * `makeRng(seed)` instances are independent and reproducible.
 */

/**
 * Creates a deterministic PRNG seeded by `seed`. Returns a function that yields
 * the next float in the half-open interval [0, 1) on each call. The same seed
 * always produces the same sequence.
 *
 * The seed is coerced to a 32-bit unsigned integer; non-integer or negative
 * seeds are accepted (they are folded into the 32-bit state) but using a plain
 * non-negative integer is recommended for clarity.
 */
export function makeRng(seed: number): () => number {
  // Fold the seed into a 32-bit state. `| 0` / `>>> 0` keep arithmetic in the
  // 32-bit integer domain that mulberry32 is defined over.
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
