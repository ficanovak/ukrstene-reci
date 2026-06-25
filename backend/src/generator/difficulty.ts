/**
 * DIFFICULTY SCORING for a generated skandinavka layout (PRD §4.2 / §4.4).
 *
 * Produces a coarse difficulty COEFFICIENT in [1, 100], buckets it into a small
 * number of difficulty BANDS, and maps each band to a contiguous range of level
 * numbers. The PRD is explicit that this need NOT be precise: levels are grouped
 * into ~20 bands and a band covers a range of level numbers (e.g. levels 50–60
 * share a band). The downstream pipeline (Task 2.7/2.8) generates layouts until
 * the coefficient lands in a target band, then assigns the layout a level number
 * from that band's range.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RARITY-INPUT DESIGN
 * ─────────────────────────────────────────────────────────────────────────
 * Word rarity comes from the DICTIONARY, not from the geometric `Layout`. We do
 * NOT pollute `layout.ts`'s output shape with frequency data. Instead rarity is
 * passed as a SEPARATE optional argument:
 *
 *     difficultyOf(layout, { avgRarity })
 *
 * where `avgRarity` is a normalized scalar in [0, 1] (0 = all words are very
 * common, 1 = all words are very rare). The caller computes it however it likes
 * — e.g. averaging a per-word `1 - normalizedFrequency` over the placed words —
 * and feeds the single summary number here. This keeps the scorer pure and the
 * rarity factor trivially testable. Out-of-range values are clamped to [0, 1].
 * When `avgRarity` is omitted we assume a neutral 0.5 so a layout still scores.
 *
 * All factor weights are NAMED CONSTANTS with documented rationale; they are
 * deliberately rough first guesses to be CALIBRATED during playtesting per the
 * PRD. The final coefficient is clamped to [1, 100].
 */

import type { Layout } from "./layout.js";

/** Optional, dictionary-derived inputs that the geometric layout cannot supply. */
export interface DifficultyOptions {
  /**
   * Average word rarity over the placed words, normalized to [0, 1].
   * 0 = all common, 1 = all rare. Omitted ⇒ neutral 0.5. Clamped to [0, 1].
   */
  avgRarity?: number;
}

// ───────────────────────────────────────────────────────────────────────────
// FACTOR WEIGHTS (sum of positive weights = 100 so a "maxed" layout ≈ 100).
// These are first-pass guesses to be tuned during playtesting.
// ───────────────────────────────────────────────────────────────────────────

/**
 * FOOTPRINT weight. A larger packed area (more letter cells) means more to
 * read/solve and a denser board, so it is the single biggest driver. Measured
 * as the fraction of the grid area covered by letters, then weighted.
 */
const W_FOOTPRINT = 30;

/**
 * WORD-COUNT weight. More distinct answers ⇒ more clues ⇒ harder. Normalized
 * against a reference count (REF_WORDS) that represents a "full" puzzle.
 */
const W_WORD_COUNT = 25;

/**
 * WORD-LENGTH weight. Longer average answers are harder to recall/fit than
 * short ones. Normalized against a reference average length (REF_AVG_LEN).
 */
const W_WORD_LENGTH = 15;

/**
 * RARITY weight. Rarer vocabulary is the strongest *content* difficulty signal,
 * independent of geometry. Driven entirely by the caller-supplied avgRarity.
 */
const W_RARITY = 20;

/**
 * CROSSINGS weight. More intersections per word means a denser interlock: each
 * answer is more constrained by its neighbours. We treat denser interlock as
 * HARDER (more letters are forced by crossings, but the solver must satisfy more
 * simultaneous constraints and the board reads as more advanced). Normalized
 * against a reference crossings-per-word ratio (REF_CROSSINGS_PER_WORD).
 */
const W_CROSSINGS = 10;

// ───────────────────────────────────────────────────────────────────────────
// REFERENCE NORMALIZERS — the "this counts as maxed-out" yardsticks. Also rough
// guesses; tuned with the weights during playtesting.
// ───────────────────────────────────────────────────────────────────────────

/** Word count at/above which the word-count factor saturates to 1. */
const REF_WORDS = 30;

/** Average answer length (in letter cells) at/above which the length factor saturates. */
const REF_AVG_LEN = 8;

/**
 * Crossings-per-word ratio at/above which the crossings factor saturates. Each
 * crossing is shared by two words; a fully interlocked grid trends toward ~1
 * crossing per word, so 1.0 is a reasonable saturation point.
 */
const REF_CROSSINGS_PER_WORD = 1.0;

/** Number of difficulty bands the [1,100] coefficient is bucketed into (PRD ≈ 20). */
export const NUM_BANDS = 20;

/** How many level numbers each band owns. Bands tile the level space contiguously. */
export const LEVELS_PER_BAND = 10;

/** Clamp helper. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Counts distinct letter cells covered by the placed words (the footprint).
 * Crossings are shared cells, so we de-duplicate by coordinate. Also returns
 * the total crossing count (cells covered by >1 word).
 */
function footprintAndCrossings(layout: Layout): {
  letterCells: number;
  crossings: number;
} {
  const counts = new Map<string, number>();
  for (const w of layout.words) {
    const dRow = w.dir === "down" ? 1 : 0;
    const dCol = w.dir === "across" ? 1 : 0;
    for (let i = 0; i < w.graphemes.length; i++) {
      const k = `${w.row + dRow * i},${w.col + dCol * i}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let crossings = 0;
  for (const c of counts.values()) {
    if (c > 1) crossings += c - 1; // a cell shared by k words = k-1 crossings
  }
  return { letterCells: counts.size, crossings };
}

/**
 * Scores a layout's difficulty as a coefficient in [1, 100]. See the module
 * header for the rarity-input design and the per-factor rationale.
 */
export function difficultyOf(
  layout: Layout,
  opts: DifficultyOptions = {},
): number {
  const wordCount = layout.words.length;

  // An empty layout has no difficulty signal; floor it at the minimum.
  if (wordCount === 0) {
    return 1;
  }

  const { letterCells, crossings } = footprintAndCrossings(layout);

  // Factor 1: footprint as a fraction of grid area (already in [0,1]).
  const area = Math.max(1, layout.width * layout.height);
  const fFootprint = clamp(letterCells / area, 0, 1);

  // Factor 2: word count normalized against the reference "full" puzzle.
  const fWordCount = clamp(wordCount / REF_WORDS, 0, 1);

  // Factor 3: average answer length normalized against the reference.
  const totalLen = layout.words.reduce((s, w) => s + w.graphemes.length, 0);
  const avgLen = totalLen / wordCount;
  const fWordLength = clamp(avgLen / REF_AVG_LEN, 0, 1);

  // Factor 4: rarity, supplied by the caller (neutral 0.5 if absent).
  const fRarity = clamp(opts.avgRarity ?? 0.5, 0, 1);

  // Factor 5: crossings per word normalized against the reference.
  const fCrossings = clamp(
    crossings / wordCount / REF_CROSSINGS_PER_WORD,
    0,
    1,
  );

  const raw =
    W_FOOTPRINT * fFootprint +
    W_WORD_COUNT * fWordCount +
    W_WORD_LENGTH * fWordLength +
    W_RARITY * fRarity +
    W_CROSSINGS * fCrossings;

  // raw is in [0, 100]; clamp to the required [1, 100] (rounded to an integer
  // so coefficients are stable, comparable, and band-bucketing is crisp).
  return clamp(Math.round(raw), 1, 100);
}

/**
 * Buckets a [1,100] coefficient into a band in 1..NUM_BANDS. Each band spans an
 * equal slice of the coefficient range (100 / NUM_BANDS points). Coefficient 1
 * ⇒ band 1, coefficient 100 ⇒ band NUM_BANDS. Out-of-range inputs clamp to the
 * nearest band so callers never get a band outside 1..NUM_BANDS.
 */
export function bandOf(coefficient: number): number {
  const span = 100 / NUM_BANDS;
  const c = clamp(coefficient, 1, 100);
  const band = Math.ceil(c / span);
  return clamp(band, 1, NUM_BANDS);
}

/**
 * Maps a band (1..NUM_BANDS) to its inclusive range of level numbers. Bands tile
 * the level space contiguously and ascending: band 1 ⇒ levels 1..LEVELS_PER_BAND,
 * band 2 ⇒ LEVELS_PER_BAND+1..2*LEVELS_PER_BAND, etc. Easier bands (lower band
 * numbers) map to lower level numbers. The band is clamped to 1..NUM_BANDS.
 */
export function levelNumberRange(band: number): { min: number; max: number } {
  const b = clamp(Math.round(band), 1, NUM_BANDS);
  const min = (b - 1) * LEVELS_PER_BAND + 1;
  const max = b * LEVELS_PER_BAND;
  return { min, max };
}
