/**
 * SINGLE-LEVEL GENERATION PIPELINE (Task 2.7).
 *
 * Composes the generator primitives — grapheme splitting (2.1), seeded RNG
 * (2.2), the skandinavka layout builder (2.4), difficulty scoring (2.5) and
 * gridData serialization (2.6) — into ONE pure, deterministic function that
 * produces a complete, ready-to-store level for a target difficulty band.
 *
 * This module owns NO persistence: it returns a plain `GenerateLevelResult`
 * object. The bulk job (Task 2.8) assigns `level_number` / `variation_group`
 * and writes it via Prisma. Everything here is pure and unit-testable without a
 * database; same input (incl. `seed` + `dictionary`) ⇒ identical result.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POLICY DECISIONS (documented as required by the task)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. GRID DIMENSIONS. Project limits are width 6–9 and height 6–12. When the
 *    caller does not pass explicit dims we SCALE them with `targetBand`: harder
 *    bands get larger grids. We linearly interpolate across the band range so
 *    band 1 ⇒ (6×6) and band NUM_BANDS ⇒ (9×12), rounding to the nearest cell.
 *    A bigger grid admits more/longer words, which raises footprint/word-count/
 *    length — the dominant difficulty factors — so this nudges the build toward
 *    the requested band before the retry loop even starts.
 *
 * 2. CANDIDATE SAMPLING (respects the 2.4 O(N²) scaling warning). `buildLayout`
 *    re-scans every remaining candidate each pass, so we MUST NOT hand it a full
 *    dictionary. We cap the pool to `MAX_CANDIDATES` words, preferring words
 *    that actually fit the chosen grid (grapheme length ≤ the larger grid
 *    dimension). Selection is deterministic: a stable fit-first filter followed
 *    by a seeded shuffle, then a slice. Per-attempt we re-shuffle from a
 *    sub-seed so different attempts explore different word subsets.
 *
 * 3. FREQUENCY → RARITY MAPPING. Dictionary `frequency` is on a normalized
 *    [0,1] scale (1 = very common, 0 = very rare). Rarity is the complement:
 *    `rarity = 1 - clamp(frequency, 0, 1)`. `avgRarity` fed to `difficultyOf`
 *    is the mean rarity over the PLACED words (not the whole pool), so the
 *    difficulty reflects the vocabulary that actually made it onto the board.
 *    Real dictionary frequencies will be calibrated later; this scale is the
 *    documented contract for now.
 *
 * 4. BAND TOLERANCE. We accept the first attempt whose band is within ±1 of
 *    `targetBand` (`BAND_TOLERANCE`). The difficulty model is intentionally
 *    coarse (PRD: ~20 bands, ranges per band), and the layout builder is greedy,
 *    so demanding an exact band would waste attempts for no perceptible player
 *    difference. The returned `difficultyBand` is always the true band of the
 *    returned layout, not the target.
 *
 * 5. ATTEMPT BUDGET + BEST-ATTEMPT FALLBACK. We try up to `MAX_ATTEMPTS`
 *    sub-seeds (`seed + i`). The first in-tolerance attempt wins. If none lands
 *    in tolerance we return the BEST attempt — the one whose band is closest to
 *    the target (ties broken by the earliest attempt for determinism) — rather
 *    than null, so the bulk job always gets a usable level near the requested
 *    difficulty. The ONLY null cases are degenerate inputs where even the best
 *    attempt placed ZERO words (empty dictionary, or words that cannot seed/
 *    interlock at all). The loop is strictly bounded, so it always terminates.
 */

import {
  bandOf,
  difficultyOf,
  NUM_BANDS,
} from "./difficulty.js";
import { splitGraphemes, type Script } from "./graphemes.js";
import {
  serializeGridData,
  type Clue,
  type GridData,
} from "./gridData.js";
import { buildLayout, type Layout } from "./layout.js";
import { makeRng } from "./rng.js";

/* ──────────────────────────────── Tunables ─────────────────────────────── */

/** Project grid limits (PRD): inclusive. */
const MIN_WIDTH = 6;
const MAX_WIDTH = 9;
const MIN_HEIGHT = 6;
const MAX_HEIGHT = 12;

/**
 * Hard cap on candidate words handed to `buildLayout`. Keeps the builder's
 * O(N²) per-pass scan tractable; well above what fits in a 9×12 grid, so it is
 * not a quality bottleneck for these grid sizes.
 */
const MAX_CANDIDATES = 40;

/** Bounded retry budget. Each attempt uses sub-seed `seed + i`. */
const MAX_ATTEMPTS = 24;

/** Accept any attempt whose band is within this many bands of the target. */
const BAND_TOLERANCE = 1;

/* ──────────────────────────────── Types ────────────────────────────────── */

/**
 * A candidate dictionary word with the data the pipeline needs: its surface
 * form, a normalized frequency in [0,1] (1 = common, 0 = rare), and its clue
 * content (carried through verbatim into gridData).
 */
export interface DictionaryEntry {
  word: string;
  /** Normalized frequency in [0,1]: 1 = very common, 0 = very rare. */
  frequency: number;
  clue: Clue;
}

export interface GenerateLevelInput {
  languageId: string;
  script: Script;
  mode: "basic" | "advanced";
  /** Target difficulty band, 1..NUM_BANDS. */
  targetBand: number;
  /** Base seed for full determinism. */
  seed: number;
  /** Candidate words with frequency + clue info. */
  dictionary: DictionaryEntry[];
  /** Optional explicit grid size; otherwise chosen within limits per band. */
  width?: number;
  height?: number;
}

export interface GenerateLevelResult {
  gridData: GridData;
  difficultyCoefficient: number;
  difficultyBand: number;
  gridWidth: number;
  gridHeight: number;
  mode: "basic" | "advanced";
  languageId: string;
  script: Script;
  // level_number / variation_group are assigned by the bulk job (Task 2.8).
}

/* ─────────────────────────────── Helpers ───────────────────────────────── */

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Chooses grid dimensions for a target band when none are supplied. Linearly
 * interpolates band 1 → (MIN_WIDTH, MIN_HEIGHT) and band NUM_BANDS → (MAX_WIDTH,
 * MAX_HEIGHT). See policy (1).
 */
function chooseDimensions(
  targetBand: number,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const w = width ?? interpolateDim(targetBand, MIN_WIDTH, MAX_WIDTH);
  const h = height ?? interpolateDim(targetBand, MIN_HEIGHT, MAX_HEIGHT);
  return {
    width: clamp(w, MIN_WIDTH, MAX_WIDTH),
    height: clamp(h, MIN_HEIGHT, MAX_HEIGHT),
  };
}

function interpolateDim(band: number, min: number, max: number): number {
  const b = clamp(band, 1, NUM_BANDS);
  const t = NUM_BANDS > 1 ? (b - 1) / (NUM_BANDS - 1) : 0;
  return Math.round(min + t * (max - min));
}

/** A pre-split candidate: dictionary entry + its grapheme cells. */
interface Candidate {
  entry: DictionaryEntry;
  graphemes: string[];
}

/** Deterministic Fisher–Yates shuffle (does not mutate input). */
function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Builds, fit-filters and caps the candidate pool for one attempt. See policy
 * (2): words that fit the grid first (stable order preserved), shuffled by the
 * attempt sub-seed, then capped to MAX_CANDIDATES.
 */
function sampleCandidates(
  all: Candidate[],
  width: number,
  height: number,
  rng: () => number,
): Candidate[] {
  // The layout builder always seeds ACROSS and picks the GLOBAL-LONGEST word as
  // the seed, requiring `length + 1 <= width` (a clue column at col-1). If the
  // pool's longest word does not satisfy that, seeding fails and the whole build
  // is empty. So we filter to words that can seed across (`length <= width-1`);
  // this also keeps every kept word short enough to fit somewhere on the board.
  // Fall back to the full pool if the fit-set is empty so we never silently
  // discard the entire dictionary.
  const maxLen = Math.max(1, width - 1);
  const fitting = all.filter((c) => c.graphemes.length <= maxLen);
  const pool = fitting.length > 0 ? fitting : all;
  return shuffled(pool, rng).slice(0, MAX_CANDIDATES);
}

/** Mean rarity (1 - frequency) over the placed words; neutral 0.5 if none. */
function avgRarityOf(layout: Layout, placedEntries: DictionaryEntry[]): number {
  if (placedEntries.length === 0) return 0.5;
  const total = placedEntries.reduce(
    (s, e) => s + (1 - clamp(e.frequency, 0, 1)),
    0,
  );
  return clamp(total / placedEntries.length, 0, 1);
}

/**
 * Maps each placed layout word back to its dictionary entry by joining its
 * graphemes into the surface word and looking it up. Returns the entries in
 * placed-word order. A word with no matching entry is skipped for rarity but
 * still gets a placeholder clue (should not happen for our own pool).
 */
function placedEntries(
  layout: Layout,
  byWord: Map<string, DictionaryEntry>,
): DictionaryEntry[] {
  const out: DictionaryEntry[] = [];
  for (const w of layout.words) {
    const entry = byWord.get(w.graphemes.join(""));
    if (entry) out.push(entry);
  }
  return out;
}

/** One scored build attempt. */
interface Attempt {
  layout: Layout;
  coefficient: number;
  band: number;
  rarity: number;
}

/* ──────────────────────────────── Pipeline ─────────────────────────────── */

export function generateLevel(
  input: GenerateLevelInput,
): GenerateLevelResult | null {
  const { languageId, script, mode, targetBand, seed, dictionary } = input;

  // 1. Dimensions.
  const { width, height } = chooseDimensions(targetBand, input.width, input.height);

  // Pre-split every dictionary word once (deterministic, independent of seed).
  // De-dupe by surface word so the rarity/clue lookup is unambiguous.
  const byWord = new Map<string, DictionaryEntry>();
  const allCandidates: Candidate[] = [];
  for (const entry of dictionary) {
    const graphemes = splitGraphemes(entry.word, script, languageId);
    const wordKey = graphemes.join("");
    if (byWord.has(wordKey)) continue;
    byWord.set(wordKey, entry);
    allCandidates.push({ entry, graphemes });
  }

  // 3. Bounded attempt loop, tracking the best (closest-band) attempt.
  let best: Attempt | null = null;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const subSeed = seed + i;
    const rng = makeRng(subSeed);

    // Sample/cap candidates for this attempt (policy 2). One RNG drives both
    // sampling and the build so the whole attempt is reproducible from subSeed.
    const sampled = sampleCandidates(allCandidates, width, height, rng);

    const layout = buildLayout({
      width,
      height,
      words: sampled.map((c) => ({ graphemes: c.graphemes })),
      rng,
    });

    if (layout.words.length === 0) {
      continue; // degenerate build; cannot score meaningfully.
    }

    const placed = placedEntries(layout, byWord);
    const rarity = avgRarityOf(layout, placed);
    const coefficient = difficultyOf(layout, { avgRarity: rarity });
    const band = bandOf(coefficient);

    // Accept immediately if within tolerance (policy 4).
    if (Math.abs(band - targetBand) <= BAND_TOLERANCE) {
      return finalize(
        { layout, coefficient, band, rarity },
        { byWord, mode, languageId, script, width, height },
      );
    }

    // Track the best (closest band; earliest attempt wins ties → determinism).
    if (best === null || Math.abs(band - targetBand) < Math.abs(best.band - targetBand)) {
      best = { layout, coefficient, band, rarity };
    }
  }

  // 4. No in-tolerance attempt. Fall back to the best non-degenerate attempt,
  // or null if every attempt was degenerate (0 words placed).
  if (best === null) {
    return null;
  }
  return finalize(best, { byWord, mode, languageId, script, width, height });
}

/**
 * Serializes an accepted attempt into the final result, injecting real clue
 * content keyed by the serializer's wordId (`"w0"`, `"w1"`, … in placed-word
 * order) from each placed word's dictionary entry. See policy (3)/(5).
 */
function finalize(
  attempt: Attempt,
  ctx: {
    byWord: Map<string, DictionaryEntry>;
    mode: "basic" | "advanced";
    languageId: string;
    script: Script;
    width: number;
    height: number;
  },
): GenerateLevelResult {
  const { layout, coefficient, band } = attempt;

  // Build clue content keyed by wordId in the SAME order serializeGridData
  // assigns ids (placed-word order), so each clue lands on its word.
  const clues: Record<string, Clue> = {};
  layout.words.forEach((w, i) => {
    const entry = ctx.byWord.get(w.graphemes.join(""));
    if (entry) {
      clues[`w${i}`] = entry.clue;
    }
  });

  const gridData = serializeGridData(layout, { clues });

  return {
    gridData,
    difficultyCoefficient: coefficient,
    difficultyBand: band,
    gridWidth: ctx.width,
    gridHeight: ctx.height,
    mode: ctx.mode,
    languageId: ctx.languageId,
    script: ctx.script,
  };
}
