/**
 * i18n infrastructure for the app UI (Task 4.2).
 *
 * Configures `i18next` + `react-i18next` and seeds the five supported
 * South-Slavic UI languages. The device locale is detected once on init via
 * `expo-localization` and mapped to one of the supported codes (falling back
 * to Serbian-Latin when the device language isn't one we ship).
 *
 * NOTE: this is the APP UI language (menus/buttons). The game CONTENT language
 * (which dictionary) is decided server-side; the two will usually match, and
 * the language PICKER (Tasks 4.5 / 8.1) calls {@link setLanguage} to switch.
 *
 * Serbian (`sr`) ships in LATIN script here; the Cyrillic/Latin gameplay
 * toggle is a separate setting and out of scope for this module.
 */
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import bs from './locales/bs.json';
import hr from './locales/hr.json';
import me from './locales/me.json';
import mk from './locales/mk.json';
import sr from './locales/sr.json';

/** The five UI languages the app ships (PRD). */
export const SUPPORTED_LANGUAGES = ['sr', 'hr', 'bs', 'me', 'mk'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

/** Default + fallback language: Serbian in Latin script. */
export const FALLBACK_LANGUAGE: LanguageCode = 'sr';

const resources = {
  sr: { translation: sr },
  hr: { translation: hr },
  bs: { translation: bs },
  me: { translation: me },
  mk: { translation: mk },
} as const;

/** Type guard: is `code` one of the supported UI languages? */
export function isSupportedLanguage(code: string | null | undefined): code is LanguageCode {
  return code != null && (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

/**
 * Resolve the device's preferred locale to a supported language code.
 *
 * `expo-localization` returns locales most-preferred-first; we pick the first
 * whose `languageCode` we support. Montenegrin is commonly reported by the OS
 * as `sr-ME`/`cnr`, so we special-case those to `me`. Anything unsupported
 * falls back to Serbian-Latin.
 */
export function detectDeviceLanguage(): LanguageCode {
  let locales: ReturnType<typeof getLocales>;
  try {
    locales = getLocales();
  } catch {
    return FALLBACK_LANGUAGE;
  }

  for (const locale of locales) {
    const tag = (locale.languageTag ?? '').toLowerCase();
    const code = (locale.languageCode ?? '').toLowerCase();

    // Montenegrin: BCP-47 `cnr`, or Serbian variant scoped to Montenegro.
    if (code === 'cnr' || tag.startsWith('sr-me') || tag.startsWith('cnr')) {
      return 'me';
    }
    if (isSupportedLanguage(code)) {
      return code;
    }
  }

  return FALLBACK_LANGUAGE;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectDeviceLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  // Keys like `mode.basic` are stored as literal flat keys, so disable the
  // nesting separators — a dot is part of the key, not a path.
  keySeparator: false,
  nsSeparator: false,
  interpolation: {
    // React already escapes output; double-escaping would corrupt strings.
    escapeValue: false,
  },
  // Don't throw/warn-crash on a missing key — return the key string instead.
  returnNull: false,
  returnEmptyString: false,
});

/**
 * Switch the active UI language. Unknown/unsupported codes are clamped to the
 * fallback language so the UI never ends up untranslated.
 */
export function setLanguage(code: string): Promise<unknown> {
  const next = isSupportedLanguage(code) ? code : FALLBACK_LANGUAGE;
  return i18n.changeLanguage(next);
}

export { i18n };
export default i18n;
