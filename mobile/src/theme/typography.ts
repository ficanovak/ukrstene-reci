/**
 * Typography tokens for "Ukrstene Reči".
 *
 * The PRD asks for a rounded, friendly sans-serif (Nunito / Poppins) that
 * supports both Cyrillic and Latin with diacritics (Š/Đ/Ć/Ś). We use Nunito
 * via `@expo-google-fonts/nunito`; its full character set covers Latin
 * Extended (the diacritics) and Cyrillic.
 *
 * The string family names below MUST match the keys passed to `useFonts` in
 * `useAppFonts` (see ./fonts.ts). Components read these tokens rather than
 * hard-coding the family name, so swapping the font later touches one place.
 */

export const fontFamily = {
  regular: 'Nunito_400Regular',
  semiBold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
} as const;

export type FontFamily = (typeof fontFamily)[keyof typeof fontFamily];

/**
 * Named text styles. `fontWeight` is intentionally omitted: each weight is a
 * distinct loaded font file, so weight is selected via `fontFamily` to keep
 * rendering consistent across iOS/Android (which otherwise synthesize weights).
 */
export const typography = {
  /** Large screen / game titles. */
  title: {
    fontFamily: fontFamily.extraBold,
    fontSize: 28,
    lineHeight: 34,
  },
  /** Section headings. */
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    lineHeight: 26,
  },
  /** Button labels and other emphasized UI text. */
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
  },
  /** Default body copy. */
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 22,
  },
  /** Small / secondary text (clue hints, captions). */
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
  },
} as const;

export type TypographyToken = keyof typeof typography;
