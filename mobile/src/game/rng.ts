/**
 * Tiny deterministic PRNG for the mobile game layer.
 *
 * We need reproducible randomness (the Advanced-mode letter deal must be stable
 * for tests and resumable for a given seed) WITHOUT pulling in a dependency and
 * WITHOUT `Math.random` (which is non-deterministic). `mulberry32` is a compact,
 * well-known 32-bit generator with good-enough distribution for shuffling a
 * handful of letter tiles.
 *
 * The backend has its own RNG util, but mobile can't import it; this is the
 * mobile-local equivalent (a 6-line generator).
 */

/** Returns a function producing floats in [0, 1) from a 32-bit integer seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a NEW array that is a deterministic Fisher–Yates shuffle of `items`
 * using `rng`. Pure: does not mutate the input. Advancing `rng` is the caller's
 * concern (the same rng instance threaded through a sequence of shuffles yields
 * a deterministic overall sequence).
 */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
