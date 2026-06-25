import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/nunito';

/**
 * Loads the brand font (Nunito) used across the app.
 *
 * Returns `[loaded, error]` straight from expo-font's `useFonts`. The keys here
 * MUST match the family names in `./typography.ts` (`fontFamily`).
 *
 * NOTE: this hook only LOADS the fonts; it does not gate rendering or control
 * the splash screen — that wiring lives in Task 4.5 (navigation root). Consume
 * this at the app root and hold the splash until `loaded` is true.
 */
export function useAppFonts(): [boolean, Error | null] {
  return useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
}
