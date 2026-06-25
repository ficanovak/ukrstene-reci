/**
 * Grapheme (crossword cell) splitting with South-Slavic digraph support.
 *
 * In a crossword each cell holds exactly one written "letter". The South-Slavic
 * Latin digraphs Lj, Nj and Dž occupy a SINGLE cell even though they are written
 * with two code points. Their Cyrillic counterparts (Љ, Њ, Џ) are already single
 * Unicode code points, so they are naturally one cell. This module turns a word
 * into the list of cells it occupies.
 *
 * KNOWN SIMPLIFICATION (v1): we apply a purely orthographic, greedy left-to-right
 * rule. ANY adjacency of L+J, N+J or D+Ž collapses into a single cell. A handful
 * of rare words exist where the constituent letters belong to separate syllables
 * and are pronounced as two phonemes (e.g. "nadživeti", "injekcija"), and for
 * those this function would (incorrectly) collapse them. We accept that for v1;
 * disambiguating requires per-word morphological data we do not have here.
 */

export type Script = "lat" | "cyr";

/**
 * Latin digraphs that occupy a single crossword cell. Stored uppercased because
 * splitting always operates on uppercased input. Order does not matter for
 * correctness (no digraph is a prefix of another) but they are kept here as the
 * canonical, exported source of truth for other modules (e.g. the in-game
 * keyboard) to reference.
 */
export const LATIN_DIGRAPHS = ["LJ", "NJ", "DŽ"] as const;

/**
 * Cyrillic digraphs. These are already single Unicode code points, so they are
 * listed for documentation/keyboard purposes; splitting handles them as ordinary
 * single-code-point letters.
 */
export const CYRILLIC_DIGRAPHS = ["Љ", "Њ", "Џ"] as const;

/**
 * Precomposed Latin DŽ forms (the Unicode "DZ WITH CARON" letters) normalized to
 * their two-code-point canonical "D" + "Ž" digraph cell.
 *   U+01C4 Ǆ (capital), U+01C5 ǅ (titlecase), U+01C6 ǆ (small)
 */
const PRECOMPOSED_DZ = /[Ǆǅǆ]/g;
const CANONICAL_DZ = "DŽ";

/**
 * Splits a word into graphemes (crossword cells), collapsing Latin digraphs into
 * a single cell. The input is uppercased first (crosswords are uppercase) and may
 * be mixed case.
 *
 * The `lang` parameter is accepted for forward compatibility (transliteration,
 * Montenegrin Ś/Ź, etc.). Montenegrin Ś and Ź are single code points and need no
 * special handling here — they are not digraphs — so `lang` does not currently
 * change behaviour. The digraph set is identical across sr/hr/bs/me Latin; mk is
 * Cyrillic with single-code-point digraphs.
 */
export function splitGraphemes(
  word: string,
  script: Script,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future lang-specific rules
  lang: string,
): string[] {
  const upper = word.toUpperCase();

  // Cyrillic digraphs are single code points; no digraph collapsing is needed.
  // We still iterate by code point (spread) so astral characters never split.
  if (script === "cyr") {
    return [...upper];
  }

  // Normalize precomposed Dž forms to the canonical "D" + "Ž" sequence so the
  // greedy matcher below handles them uniformly.
  const normalized = upper.replace(PRECOMPOSED_DZ, CANONICAL_DZ);

  const cells: string[] = [];
  const chars = [...normalized];
  for (let i = 0; i < chars.length; i++) {
    const pair = i + 1 < chars.length ? chars[i] + chars[i + 1] : "";
    if (pair !== "" && (LATIN_DIGRAPHS as readonly string[]).includes(pair)) {
      cells.push(pair);
      i++; // consume the second code point of the digraph
    } else {
      cells.push(chars[i]);
    }
  }
  return cells;
}

/**
 * Number of crossword cells the word occupies (digraphs count as one).
 */
export function graphemeLength(
  word: string,
  script: Script,
  lang: string,
): number {
  return splitGraphemes(word, script, lang).length;
}
