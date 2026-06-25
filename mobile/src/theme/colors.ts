/**
 * Color palettes for "Ukrstene Reči".
 *
 * Two themes share the SAME shape (identical keys) so that any component can
 * switch between them just by reading `useTheme().colors`.
 *
 * Light theme — "Topla enigmatika" (PRD §10.1): warm, paper-like background
 * with a teal accent and amber letter tiles. This is the PRIMARY theme.
 *
 * Dark theme — "Tamna tema" (PRD §10.2): the PRD only fixes the dark
 * `background` (#161A1D) and the rules "teal/amber accents brighten; the
 * correct/coral feedback colors stay". The remaining dark values are derived
 * here and documented inline.
 */

/** Semantic color tokens shared by every theme. */
export type ThemeColors = {
  /** Screen / surface background. */
  background: string;
  /** Teal accent — primary buttons, the active word, highlights. */
  primary: string;
  /** Amber — letter tiles, stars / rewards. */
  secondary: string;
  /** Light blue-grey clue (definition) cells. */
  clueCell: string;
  /** Success / correct-answer feedback (green). */
  correct: string;
  /** Error / wrong-answer feedback (coral). */
  wrong: string;
  /** Primary text color (graphite on light, off-white on dark). */
  text: string;
};

/** Light theme — "Topla enigmatika". Exact PRD §10.1 values. */
export const lightColors: ThemeColors = {
  background: '#FAF7F2',
  primary: '#0E7C86',
  secondary: '#F4B740',
  clueCell: '#EAF0F5',
  correct: '#3FB984',
  wrong: '#E5604D',
  text: '#22272B',
};

/**
 * Dark theme — "Tamna tema".
 *
 * Derivations (PRD §10.2 only fixes `background` + the brighten/stay rules):
 * - `background` #161A1D — PRD-fixed.
 * - `text` #EAE6DF — warm off-white (matches the light theme's warm paper feel
 *   rather than a clinical pure white); high contrast on the dark background.
 * - `primary` #19A6B3 — the teal #0E7C86 brightened so it reads as a vivid
 *   accent on the dark surface (PRD: "teal accents brighten").
 * - `secondary` #F6C254 — the amber #F4B740 nudged slightly brighter so the
 *   tiles/stars pop on dark (PRD: "amber accents stay bright").
 * - `clueCell` #222A30 — a dark blue-grey surface; the dark-mode analogue of
 *   the light #EAF0F5 clue cell, sitting just above the background.
 * - `correct` #3FB984 / `wrong` #E5604D — UNCHANGED from light (PRD:
 *   "correct/coral stay"); they remain legible on the dark background.
 */
export const darkColors: ThemeColors = {
  background: '#161A1D',
  primary: '#19A6B3',
  secondary: '#F6C254',
  clueCell: '#222A30',
  correct: '#3FB984',
  wrong: '#E5604D',
  text: '#EAE6DF',
};
