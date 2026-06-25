/**
 * Pure scoring + star rating for the "Ukrstene Reči" crossword.
 *
 * Shared by BOTH play modes (Basic + Advanced). No UI, no side effects: a single
 * pure function maps a completed level's penalty signals (mistakes, hints) plus
 * its difficulty band to a star rating (1..5) and a numeric score for display /
 * future leaderboards. Consumed by the Results screen (Task 7.3) and the game
 * screens. Engines (`engine.ts` / `advanced.ts`) supply `mistakes`; hints
 * (Task 7.2) supply `hintsUsed`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MODEL (PRD §7.1) — "greške + hintovi", softened by difficulty band.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. PENALTY. A single non-negative "penalty point" total combines the two
 *    signals: penalty = mistakes + HINT_WEIGHT * hintsUsed. Hints are weighted
 *    so each hint costs the same as some number of mistakes (see HINT_WEIGHT).
 *
 * 2. PERFECT = 5★. penalty === 0 (0 mistakes AND 0 hints) is always 5 stars at
 *    every band. This falls out of the threshold check (penalty < first
 *    threshold), but is the headline guarantee.
 *
 * 3. STAR TIERS. STAR_THRESHOLDS holds the *band-1* penalty cutoffs at which the
 *    rating drops to 4★, 3★, 2★, 1★ respectively (ascending). You keep 5★ while
 *    penalty < threshold[0]; you fall to 4★ at threshold[0], 3★ at threshold[1],
 *    and so on. Past the last threshold you are clamped to the 1★ floor — a
 *    COMPLETED level is never 0 stars (completion always earns at least 1).
 *
 * 4. BAND FORGIVENESS. Harder bands forgive more. We scale every threshold by an
 *    allowance that grows with the band:
 *        allowance(band) = 1 + (band - 1) * BAND_FORGIVENESS_STEP
 *    so band 1 uses the raw thresholds (allowance 1.0) and band NUM_BANDS tolerates
 *    ~BAND_FORGIVENESS_STEP*(NUM_BANDS-1) times as many penalty points for the same
 *    star tier. This makes the SAME mistake count yield MORE stars on a higher band.
 *
 * 5. SCORE. A simple integer for "Rezultat" display & later leaderboards:
 *        score = max(0, round(BASE_POINTS * bandMultiplier - PENALTY_POINTS * penalty))
 *    where bandMultiplier = 1 + (band - 1) * BAND_SCORE_STEP, so harder levels are
 *    worth proportionally more, and a perfect solve earns the band's max. Penalties
 *    subtract a flat amount per penalty point; the result is clamped at 0.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CALIBRATION. All numbers below are FIRST-PASS constants, mirroring the spirit
 * of the backend's "to calibrate" difficulty weights. They are NAMED and TUNABLE
 * so playtesting can adjust the feel without touching logic. The ones most likely
 * to need tuning: STAR_THRESHOLDS (how punishing each tier is), HINT_WEIGHT (how
 * much a hint stings), and BAND_FORGIVENESS_STEP (how steeply higher bands relax).
 */

/** Mirrors the backend generator's NUM_BANDS (bands 1 easy → 20 hard). */
export const NUM_BANDS = 20;

/** Floor / ceiling for the returned star count. A finished level is 1..5, never 0/6. */
export const MIN_STARS = 1 as const;
export const MAX_STARS = 5 as const;

/**
 * How many "mistake-equivalents" a single hint costs.
 *
 * Chosen as 1: a hint stings exactly like one mistake. With STAR_THRESHOLDS[0] = 1,
 * this means 1 hint with 0 mistakes lands at 4★ on band 1 (a still-high rating —
 * "you solved it cleanly but peeked once"), never unfairly tanking the score. The
 * PRD floats "~1–2 mistakes"; 1 is the gentle end and is easy to re-tune upward
 * during playtesting if hints feel too cheap. TUNABLE.
 */
export const HINT_WEIGHT = 1;

/**
 * Band-1 penalty cutoffs (ascending) at which the rating drops to 4★, 3★, 2★, 1★.
 *
 * Read as: you KEEP 5★ while penalty < 1; drop to 4★ at penalty 1, 3★ at 3, 2★ at
 * 6, 1★ at 10+. These are at band 1 (the strictest); higher bands scale them up by
 * `allowance(band)`. Length is exactly 4 (one per dropped tier below 5★). TUNABLE —
 * the single biggest knob for "how generous are stars."
 */
export const STAR_THRESHOLDS: readonly number[] = [1, 3, 6, 10];

/**
 * How much each band relaxes the thresholds. allowance(band) = 1 + (band-1)*STEP.
 * 0.25 ⇒ band 20 tolerates 1 + 19*0.25 = 5.75× the band-1 penalty for each tier.
 * TUNABLE — controls how strongly difficulty forgives mistakes.
 */
export const BAND_FORGIVENESS_STEP = 0.25;

/** Base points a perfect band-1 solve is worth. TUNABLE (display/leaderboard only). */
export const BASE_POINTS = 1000;

/** Points subtracted per penalty point (mistake or weighted hint). TUNABLE. */
export const PENALTY_POINTS = 25;

/** How much each band raises the point ceiling. bandMultiplier = 1 + (band-1)*STEP. */
export const BAND_SCORE_STEP = 0.1;

/** Input to {@link scoreLevel}. All counts are for a single completed level. */
export interface ScoreInput {
  /** Wrong entries tracked by the engine (see engine.ts mistake rule). */
  mistakes: number;
  /** Hints the player used on this level (Task 7.2). */
  hintsUsed: number;
  /** Difficulty band 1..NUM_BANDS (clamped if out of range). */
  difficultyBand: number;
}

/** Result of {@link scoreLevel}: a star rating and a numeric score for display. */
export interface ScoreResult {
  stars: 1 | 2 | 3 | 4 | 5;
  /** Non-negative integer points value (for "Rezultat" / leaderboards). */
  score: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Non-negative integer normalization for defensiveness against bad inputs. */
function nonNegInt(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Allowance multiplier for a band: 1.0 at band 1, growing with difficulty. */
function bandAllowance(band: number): number {
  return 1 + (band - 1) * BAND_FORGIVENESS_STEP;
}

/**
 * Computes the star rating (1..5) and display score for one completed level.
 * Pure: depends only on its input. See the module docstring for the full model.
 */
export function scoreLevel(input: ScoreInput): ScoreResult {
  const band = clamp(Math.round(input.difficultyBand), 1, NUM_BANDS);
  const mistakes = nonNegInt(input.mistakes);
  const hintsUsed = nonNegInt(input.hintsUsed);

  const penalty = mistakes + HINT_WEIGHT * hintsUsed;
  const allowance = bandAllowance(band);

  // Start at MAX_STARS and drop one tier for each scaled threshold we meet/exceed.
  let stars: number = MAX_STARS;
  for (const base of STAR_THRESHOLDS) {
    if (penalty >= base * allowance) stars -= 1;
  }
  stars = clamp(stars, MIN_STARS, MAX_STARS);

  const bandMultiplier = 1 + (band - 1) * BAND_SCORE_STEP;
  const rawScore = BASE_POINTS * bandMultiplier - PENALTY_POINTS * penalty;
  const score = Math.max(0, Math.round(rawScore));

  return { stars: stars as ScoreResult["stars"], score };
}
