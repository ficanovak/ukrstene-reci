/**
 * Tests for the i18n infrastructure (Task 4.2).
 *
 * We deliberately import the locale JSON resources directly to assert their
 * shape (same key set across all 5 languages) and to pin a few human-visible
 * strings per language — so a forgotten translation or an accidental script
 * mix-up (e.g. Latin slipping into Macedonian) is caught immediately.
 */
import sr from './locales/sr.json';
import hr from './locales/hr.json';
import bs from './locales/bs.json';
import me from './locales/me.json';
import mk from './locales/mk.json';

import {
  i18n,
  setLanguage,
  detectDeviceLanguage,
  isSupportedLanguage,
  SUPPORTED_LANGUAGES,
  FALLBACK_LANGUAGE,
} from './index';

/**
 * Mock expo-localization so we can drive `detectDeviceLanguage()` with
 * arbitrary device locales without depending on the test runner's host OS.
 */
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageTag: 'en-US', languageCode: 'en' }]),
}));
const { getLocales } = jest.requireMock('expo-localization') as {
  getLocales: jest.Mock;
};
const mockLocale = (languageTag: string, languageCode: string) =>
  getLocales.mockReturnValue([{ languageTag, languageCode }]);

const LOCALES = { sr, hr, bs, me, mk } as const;

describe('supported languages', () => {
  it('declares exactly the 5 PRD languages', () => {
    expect([...SUPPORTED_LANGUAGES].sort()).toEqual(['bs', 'hr', 'me', 'mk', 'sr']);
  });

  it('falls back to Serbian (Latin) by default', () => {
    expect(FALLBACK_LANGUAGE).toBe('sr');
  });
});

describe('locale resources share an identical key set', () => {
  const srKeys = Object.keys(sr).sort();

  it.each(['hr', 'bs', 'me', 'mk'] as const)(
    '%s has exactly the same keys as sr (no missing/extra translations)',
    (code) => {
      expect(Object.keys(LOCALES[code]).sort()).toEqual(srKeys);
    },
  );

  it('every value in every locale is a non-empty string', () => {
    for (const resource of Object.values(LOCALES)) {
      for (const value of Object.values(resource)) {
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('script invariants', () => {
  // Cyrillic Unicode block: U+0400–U+04FF.
  const hasCyrillic = (s: string) => /[Ѐ-ӿ]/.test(s);

  it('Macedonian is written in Cyrillic', () => {
    expect(hasCyrillic(mk.play)).toBe(true);
    expect(hasCyrillic(mk.settings)).toBe(true);
    expect(mk.play).toBe('Играј');
  });

  it('sr/hr/bs/me are written in Latin (no Cyrillic)', () => {
    for (const code of ['sr', 'hr', 'bs', 'me'] as const) {
      for (const value of Object.values(LOCALES[code])) {
        expect(hasCyrillic(value as string)).toBe(false);
      }
    }
  });
});

describe('t() returns localized strings for the active language', () => {
  afterEach(() => setLanguage('sr'));

  it.each([
    ['sr', sr.play],
    ['hr', hr.play],
    ['bs', bs.play],
    ['me', me.play],
    ['mk', mk.play],
  ] as const)('after setLanguage(%s), t("play") === %s', async (code, expected) => {
    await setLanguage(code);
    expect(i18n.t('play')).toBe(expected);
  });

  it('setLanguage switches the active language for subsequent t() calls', async () => {
    await setLanguage('sr');
    expect(i18n.t('settings')).toBe(sr.settings);

    await setLanguage('mk');
    expect(i18n.t('settings')).toBe(mk.settings);
    expect(i18n.language).toBe('mk');
  });
});

describe('device-locale detection (expo-localization)', () => {
  it('maps a supported device language directly', () => {
    mockLocale('hr-HR', 'hr');
    expect(detectDeviceLanguage()).toBe('hr');
    mockLocale('mk-MK', 'mk');
    expect(detectDeviceLanguage()).toBe('mk');
  });

  it('maps Montenegrin variants (cnr, sr-ME) to "me"', () => {
    mockLocale('cnr-ME', 'cnr');
    expect(detectDeviceLanguage()).toBe('me');
    mockLocale('sr-ME', 'sr');
    expect(detectDeviceLanguage()).toBe('me');
  });

  it('falls back to sr for an unsupported device language', () => {
    mockLocale('en-US', 'en');
    expect(detectDeviceLanguage()).toBe(FALLBACK_LANGUAGE);
    expect(FALLBACK_LANGUAGE).toBe('sr');
  });

  it('falls back to sr when getLocales throws', () => {
    getLocales.mockImplementationOnce(() => {
      throw new Error('native module unavailable');
    });
    expect(detectDeviceLanguage()).toBe('sr');
  });

  it('isSupportedLanguage guards correctly', () => {
    expect(isSupportedLanguage('sr')).toBe(true);
    expect(isSupportedLanguage('en')).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});

describe('graceful fallback', () => {
  it('an unknown key returns the key itself (no throw)', () => {
    expect(() => i18n.t('this.key.does.not.exist')).not.toThrow();
    expect(i18n.t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });

  it('an unsupported language code resolves to the Serbian fallback value', async () => {
    // setLanguage clamps unknown codes to the fallback (sr).
    await setLanguage('xx' as unknown as 'sr');
    expect(i18n.t('play')).toBe(sr.play);
  });
});
