/**
 * Pure (language, script) → keyboard layout for the in-game custom keyboard
 * (Task 5.3).
 *
 * Each layout is an array of ROWS; each row is an array of grapheme KEYS. A key
 * is the exact grapheme it emits when tapped — crucially the South-Slavic Latin
 * digraphs `LJ`, `NJ`, `DŽ` are SINGLE keys emitting the two-code-point grapheme
 * (the engine treats them as one crossword cell). The Cyrillic counterparts
 * `Љ Њ Џ` are already single code points, so they are ordinary single keys.
 *
 * Everything is UPPERCASE (crosswords are uppercase). Backspace is NOT a key
 * here — it's a separate control rendered by the component.
 *
 * The digraph rules mirror the backend `graphemes.ts`
 * (LATIN_DIGRAPHS = LJ/NJ/DŽ). We can't import the backend, so the alphabets are
 * defined locally and kept correct here.
 *
 * ── (language, script) → alphabet resolution ──────────────────────────────────
 *   sr  → script picks it: 'lat' → Gajica Latin, 'cyr' → Serbian Cyrillic.
 *   hr  → always Gajica Latin (script arg ignored).
 *   bs  → always Gajica Latin.
 *   me  → always Montenegrin Latin (Gajica + Ś + Ź).
 *   mk  → always Macedonian Cyrillic.
 * Only `sr` is user-toggleable between scripts; the others have a fixed script.
 *
 * ── Row arrangement ───────────────────────────────────────────────────────────
 * Phones are narrow, so we cap rows at ≤10 keys and use 3 rows for the Latin
 * sets and 3–4 rows for Cyrillic. The order follows the standard alphabetical
 * azbuka/abeceda order (familiar to players), simply wrapped every ~10 keys, so
 * the keyboard reads like the alphabet rather than a QWERTY remap. The digraph
 * keys sit in their natural alphabetical position (LJ after L, NJ after N, DŽ
 * after D); the component may render them slightly wider, but the data keeps a
 * tidy grid.
 */
import type { LanguageCode } from '@/i18n';

export type Script = 'lat' | 'cyr';

/** A keyboard layout: rows of grapheme keys (each key is the emitted grapheme). */
export type KeyboardLayout = string[][];

/**
 * Gajica (South-Slavic) Latin abeceda — 30 letters, with LJ/NJ/DŽ as single
 * digraph keys. Used by sr/lat, hr, bs (and as the base for Montenegrin).
 * Order: A B C Č Ć D DŽ Đ E F G H I J K L LJ M N NJ O P R S Š T U V Z Ž.
 */
export const GAJICA_LATIN: readonly string[] = [
  'A', 'B', 'C', 'Č', 'Ć', 'D', 'DŽ', 'Đ', 'E', 'F',
  'G', 'H', 'I', 'J', 'K', 'L', 'LJ', 'M', 'N', 'NJ',
  'O', 'P', 'R', 'S', 'Š', 'T', 'U', 'V', 'Z', 'Ž',
];

/**
 * Montenegrin Latin — the Gajica abeceda PLUS Ś and Ź (32 letters). Ś and Ź are
 * single code points (not digraphs). Appended after their phonetic neighbours
 * (Ś after S/Š, Ź after Z/Ž) so the order stays alphabetically sensible.
 */
export const MONTENEGRIN_LATIN: readonly string[] = [
  'A', 'B', 'C', 'Č', 'Ć', 'D', 'DŽ', 'Đ', 'E', 'F',
  'G', 'H', 'I', 'J', 'K', 'L', 'LJ', 'M', 'N', 'NJ',
  'O', 'P', 'R', 'S', 'Š', 'Ś', 'T', 'U', 'V', 'Z',
  'Ž', 'Ź',
];

/**
 * Serbian Cyrillic — Vukova azbuka, 30 letters. Љ Њ Џ are single code points.
 * Order: А Б В Г Д Ђ Е Ж З И Ј К Л Љ М Н Њ О П Р С Т Ћ У Ф Х Ц Ч Џ Ш.
 */
export const SERBIAN_CYRILLIC: readonly string[] = [
  'А', 'Б', 'В', 'Г', 'Д', 'Ђ', 'Е', 'Ж', 'З', 'И',
  'Ј', 'К', 'Л', 'Љ', 'М', 'Н', 'Њ', 'О', 'П', 'Р',
  'С', 'Т', 'Ћ', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Џ', 'Ш',
];

/**
 * Macedonian Cyrillic — 31 letters. Has Ѓ Ќ Ѕ; lacks Ђ Ћ Ј-aside (it keeps Ј).
 * Order: А Б В Г Д Ѓ Е Ж З Ѕ И Ј К Л Љ М Н Њ О П Р С Т Ќ У Ф Х Ц Ч Џ Ш.
 */
export const MACEDONIAN_CYRILLIC: readonly string[] = [
  'А', 'Б', 'В', 'Г', 'Д', 'Ѓ', 'Е', 'Ж', 'З', 'Ѕ',
  'И', 'Ј', 'К', 'Л', 'Љ', 'М', 'Н', 'Њ', 'О', 'П',
  'Р', 'С', 'Т', 'Ќ', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Џ',
  'Ш',
];

/**
 * Splits a flat alphabet into rows of at most `perRow` keys, preserving order.
 * Pure helper so the row arrangement is data-driven and easy to reason about.
 */
function intoRows(alphabet: readonly string[], perRow: number): KeyboardLayout {
  const rows: KeyboardLayout = [];
  for (let i = 0; i < alphabet.length; i += perRow) {
    rows.push(alphabet.slice(i, i + perRow));
  }
  return rows;
}

/**
 * Resolves the alphabet for a (language, script) pair. Only `sr` consults the
 * script; the other languages have a fixed script and ignore the argument.
 */
function alphabetFor(language: LanguageCode, script: Script): readonly string[] {
  switch (language) {
    case 'hr':
    case 'bs':
      return GAJICA_LATIN;
    case 'me':
      return MONTENEGRIN_LATIN;
    case 'mk':
      return MACEDONIAN_CYRILLIC;
    case 'sr':
      return script === 'cyr' ? SERBIAN_CYRILLIC : GAJICA_LATIN;
    default: {
      // Exhaustiveness guard: if LanguageCode gains a member, this errors at
      // compile time. Fall back to Gajica Latin defensively at runtime.
      const _exhaustive: never = language;
      void _exhaustive;
      return GAJICA_LATIN;
    }
  }
}

/**
 * Returns the keyboard layout (rows of grapheme keys) for the given language and
 * script. 30–32-key alphabets wrap at 10 per row → 3–4 tidy rows that fit a
 * phone width.
 */
export function getLayout(language: LanguageCode, script: Script): KeyboardLayout {
  return intoRows(alphabetFor(language, script), 10);
}

/** Flattens a layout into the ordered list of its grapheme keys. */
export function keysOf(layout: KeyboardLayout): string[] {
  return layout.flat();
}
