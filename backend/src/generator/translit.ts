/**
 * Serbian Cyrillic <-> Latin transliteration.
 *
 * Serbian is the only bi-script language in this project (mk is Cyrillic-only;
 * hr/bs/me are Latin-only), so these functions are intentionally Serbian-specific.
 *
 * The Serbian alphabet has a fully deterministic, almost-perfectly-reversible
 * 1:1 correspondence between Cyrillic and Latin EXCEPT that three Cyrillic
 * letters map to Latin DIGRAPHS:
 *   Љ -> Lj,  Њ -> Nj,  Џ -> Dž
 * Going Latin -> Cyrillic those digraphs collapse back to a single code point.
 *
 * CASING RULE for digraphs (Cyrillic single letter -> two-letter Latin):
 *   - lower-case Cyrillic letter        -> lower-case digraph   (љ  -> lj)
 *   - upper-case Cyrillic letter,
 *       next char is upper-case OR none -> ALL-CAPS digraph      (Љ before У -> LJ)
 *       next char is lower-case         -> title-case digraph    (Љ before у -> Lj)
 * This makes the dominant crossword-storage path (all uppercase) round-trip:
 *   ЉУБАВ <-> LJUBAV.  And ordinary capitalised words render naturally:
 *   Његош <-> Njegoš.
 *
 * Going Latin -> Cyrillic we greedily consume the digraphs Lj/LJ/lj, Nj/NJ/nj,
 * Dž/DŽ/dž BEFORE single letters, reusing the canonical digraph list from
 * graphemes.ts.
 *
 * KNOWN LIMITATION (not round-trippable in general): a few Serbian words contain
 * an L+J, N+J or D+Ž sequence that is genuinely TWO Cyrillic letters spanning a
 * morpheme boundary (e.g. "nadživeti" = на-д-живети -> ...дж..., "injekcija" =
 * ин-јекција -> ...нј...). With purely orthographic data we cannot distinguish
 * these from true digraphs, so Latin -> Cyrillic will (incorrectly) collapse them
 * to Џ/Њ. Disambiguating needs per-word morphological data we do not have here.
 * For the curated crossword dictionary this is acceptable.
 */

import { CYRILLIC_DIGRAPHS } from "./graphemes.js";

/**
 * Base Cyrillic -> Latin mapping for SINGLE Cyrillic code points (uppercase).
 * The three digraph letters map to two-letter Latin strings; everything else is
 * a single letter. Lower-case is derived programmatically.
 */
const CYR_TO_LAT_UPPER: Record<string, string> = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Ђ: "Đ",
  Е: "E",
  Ж: "Ž",
  З: "Z",
  И: "I",
  Ј: "J",
  К: "K",
  Л: "L",
  Љ: "LJ",
  М: "M",
  Н: "N",
  Њ: "NJ",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  Ћ: "Ć",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "C",
  Ч: "Č",
  Џ: "DŽ",
  Ш: "Š",
};

const CYRILLIC_DIGRAPH_SET: ReadonlySet<string> = new Set(CYRILLIC_DIGRAPHS);

/**
 * Latin -> Cyrillic mapping for SINGLE uppercase Latin letters, derived by
 * inverting the non-digraph entries of CYR_TO_LAT_UPPER. Digraphs are handled
 * separately (greedily) and so are excluded here.
 */
const LAT_TO_CYR_UPPER: Record<string, string> = Object.fromEntries(
  Object.entries(CYR_TO_LAT_UPPER)
    .filter(([cyr]) => !CYRILLIC_DIGRAPH_SET.has(cyr))
    .map(([cyr, lat]) => [lat, cyr]),
);

/**
 * Uppercase Latin digraph -> uppercase Cyrillic letter, e.g. "LJ" -> "Љ".
 */
const LAT_DIGRAPH_TO_CYR_UPPER: Record<string, string> = Object.fromEntries(
  Object.entries(CYR_TO_LAT_UPPER)
    .filter(([cyr]) => CYRILLIC_DIGRAPH_SET.has(cyr))
    .map(([cyr, lat]) => [lat, cyr]),
);

function isUpperCase(ch: string): boolean {
  return ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function isLowerCase(ch: string): boolean {
  return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
}

/**
 * Transliterates a Serbian Cyrillic word to Latin. Characters outside the
 * Serbian Cyrillic alphabet (digits, punctuation, spaces) pass through unchanged.
 */
export function cyrToLat(word: string): string {
  const chars = [...word];
  let out = "";

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const upper = ch.toUpperCase();
    const latUpper = CYR_TO_LAT_UPPER[upper];

    if (latUpper === undefined) {
      // Not a Serbian Cyrillic letter; pass through verbatim.
      out += ch;
      continue;
    }

    const charIsUpper = isUpperCase(ch);

    // Single-letter mapping.
    if (latUpper.length === 1) {
      out += charIsUpper ? latUpper : latUpper.toLowerCase();
      continue;
    }

    // Two-letter digraph: apply the documented casing rule.
    if (!charIsUpper) {
      out += latUpper.toLowerCase(); // lj / nj / dž
      continue;
    }

    // Uppercase Cyrillic digraph letter: ALL-CAPS if the next char is uppercase
    // or there is no next letter; otherwise title-case.
    const next = chars[i + 1];
    const nextIsLower = next !== undefined && isLowerCase(next);
    out += nextIsLower
      ? latUpper[0] + latUpper.slice(1).toLowerCase() // Lj / Nj / Dž
      : latUpper; // LJ / NJ / DŽ
  }

  return out;
}

/**
 * Transliterates a Serbian Latin word to Cyrillic, greedily consuming the
 * digraphs Lj/LJ/lj, Nj/NJ/nj, Dž/DŽ/dž before single letters. Characters
 * outside the Serbian Latin alphabet pass through unchanged.
 */
export function latToCyr(word: string): string {
  const chars = [...word];
  let out = "";

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const next = chars[i + 1];

    // Greedily test for a two-letter digraph first.
    if (next !== undefined) {
      const pairUpper = (ch + next).toUpperCase();
      const cyrUpper = LAT_DIGRAPH_TO_CYR_UPPER[pairUpper];
      if (cyrUpper !== undefined) {
        // Case is decided by the FIRST letter of the digraph (the convention is
        // that "Lj"/"LJ" lead with the capital; a lowercase first letter means
        // the whole digraph is lowercase).
        out += isUpperCase(ch) ? cyrUpper : cyrUpper.toLowerCase();
        i++; // consume the second letter
        continue;
      }
    }

    // Single Latin letter.
    const upper = ch.toUpperCase();
    const cyrUpper = LAT_TO_CYR_UPPER[upper];
    if (cyrUpper === undefined) {
      out += ch; // pass through
      continue;
    }
    out += isUpperCase(ch) ? cyrUpper : cyrUpper.toLowerCase();
  }

  return out;
}
