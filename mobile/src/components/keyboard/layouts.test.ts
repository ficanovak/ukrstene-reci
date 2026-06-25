/**
 * Tests for the pure (language, script) → keyboard layout function.
 *
 * These are the IMPORTANT tests for Task 5.3: alphabet correctness per
 * language/script, digraphs as SINGLE keys, and the Macedonian/Montenegrin
 * specifics. The component (Keyboard.tsx) just renders whatever this returns.
 */
import {
  GAJICA_LATIN,
  MONTENEGRIN_LATIN,
  MACEDONIAN_CYRILLIC,
  SERBIAN_CYRILLIC,
  getLayout,
  keysOf,
} from './layouts';

/** Flattens rows into the ordered list of grapheme keys. */
function flat(language: Parameters<typeof getLayout>[0], script: Parameters<typeof getLayout>[1]): string[] {
  return keysOf(getLayout(language, script));
}

describe('getLayout — Latin (Gajica): sr/lat, hr, bs', () => {
  it('sr/lat contains the digraphs as SINGLE keys emitting the grapheme', () => {
    const keys = flat('sr', 'lat');
    expect(keys).toContain('LJ');
    expect(keys).toContain('NJ');
    expect(keys).toContain('DŽ');
  });

  it('sr/lat contains the Gajica diacritic letters', () => {
    const keys = flat('sr', 'lat');
    for (const g of ['Š', 'Đ', 'Č', 'Ć', 'Ž']) {
      expect(keys).toContain(g);
    }
  });

  it('sr/lat also has plain D and Ž as their own keys (distinct from DŽ)', () => {
    const keys = flat('sr', 'lat');
    expect(keys).toContain('D');
    expect(keys).toContain('Ž');
    // and the digraph is its own distinct key
    expect(keys).toContain('DŽ');
  });

  it('hr and bs resolve to the same Gajica Latin alphabet as sr/lat', () => {
    expect(new Set(flat('hr', 'lat'))).toEqual(new Set(GAJICA_LATIN));
    expect(new Set(flat('bs', 'lat'))).toEqual(new Set(GAJICA_LATIN));
    expect(new Set(flat('sr', 'lat'))).toEqual(new Set(GAJICA_LATIN));
  });

  it('Gajica Latin has exactly 30 keys', () => {
    expect(GAJICA_LATIN).toHaveLength(30);
    expect(flat('sr', 'lat')).toHaveLength(30);
  });

  it('does NOT contain Montenegrin Ś / Ź', () => {
    const keys = flat('hr', 'lat');
    expect(keys).not.toContain('Ś');
    expect(keys).not.toContain('Ź');
  });
});

describe('getLayout — Montenegrin (me)', () => {
  it('includes everything in Gajica PLUS Ś and Ź', () => {
    const keys = flat('me', 'lat');
    for (const g of GAJICA_LATIN) {
      expect(keys).toContain(g);
    }
    expect(keys).toContain('Ś');
    expect(keys).toContain('Ź');
  });

  it('still has the digraph keys as single keys', () => {
    const keys = flat('me', 'lat');
    expect(keys).toContain('LJ');
    expect(keys).toContain('NJ');
    expect(keys).toContain('DŽ');
  });

  it('has exactly 32 keys (Gajica 30 + Ś + Ź)', () => {
    expect(MONTENEGRIN_LATIN).toHaveLength(32);
    expect(flat('me', 'lat')).toHaveLength(32);
  });
});

describe('getLayout — Serbian Cyrillic (sr/cyr)', () => {
  it('includes the single-code-point digraphs Љ Њ Џ and Ђ Ћ', () => {
    const keys = flat('sr', 'cyr');
    for (const g of ['Љ', 'Њ', 'Џ', 'Ђ', 'Ћ']) {
      expect(keys).toContain(g);
    }
  });

  it('has exactly 30 keys (Vukova azbuka)', () => {
    expect(SERBIAN_CYRILLIC).toHaveLength(30);
    expect(flat('sr', 'cyr')).toHaveLength(30);
  });

  it('does NOT contain Macedonian-only letters Ѓ Ќ Ѕ', () => {
    const keys = flat('sr', 'cyr');
    expect(keys).not.toContain('Ѓ');
    expect(keys).not.toContain('Ќ');
    expect(keys).not.toContain('Ѕ');
  });
});

describe('getLayout — Macedonian Cyrillic (mk)', () => {
  it('includes Љ Њ Џ Ѓ Ќ Ѕ', () => {
    const keys = flat('mk', 'cyr');
    for (const g of ['Љ', 'Њ', 'Џ', 'Ѓ', 'Ќ', 'Ѕ']) {
      expect(keys).toContain(g);
    }
  });

  it('EXCLUDES Ђ and Ћ (not in the Macedonian alphabet)', () => {
    const keys = flat('mk', 'cyr');
    expect(keys).not.toContain('Ђ');
    expect(keys).not.toContain('Ћ');
  });

  it('has exactly 31 keys (Macedonian alphabet)', () => {
    expect(MACEDONIAN_CYRILLIC).toHaveLength(31);
    expect(flat('mk', 'cyr')).toHaveLength(31);
  });

  it('mk ignores the passed script and is always Cyrillic', () => {
    expect(new Set(flat('mk', 'lat'))).toEqual(new Set(MACEDONIAN_CYRILLIC));
  });
});

describe('getLayout — resolution rules', () => {
  it('hr/bs/me are always Latin regardless of script arg', () => {
    expect(new Set(flat('hr', 'cyr'))).toEqual(new Set(GAJICA_LATIN));
    expect(new Set(flat('bs', 'cyr'))).toEqual(new Set(GAJICA_LATIN));
    expect(new Set(flat('me', 'cyr'))).toEqual(new Set(MONTENEGRIN_LATIN));
  });

  it('sr honors the passed script', () => {
    expect(new Set(flat('sr', 'lat'))).toEqual(new Set(GAJICA_LATIN));
    expect(new Set(flat('sr', 'cyr'))).toEqual(new Set(SERBIAN_CYRILLIC));
  });
});

describe('layout invariants (every layout)', () => {
  const cases: Array<[Parameters<typeof getLayout>[0], Parameters<typeof getLayout>[1]]> = [
    ['sr', 'lat'],
    ['sr', 'cyr'],
    ['hr', 'lat'],
    ['bs', 'lat'],
    ['me', 'lat'],
    ['mk', 'cyr'],
  ];

  it.each(cases)('(%s,%s): every key is a non-empty uppercase grapheme', (lang, script) => {
    for (const key of flat(lang, script)) {
      expect(key.length).toBeGreaterThan(0);
      expect(key).toBe(key.toUpperCase());
    }
  });

  it.each(cases)('(%s,%s): every key appears exactly once (no duplicates)', (lang, script) => {
    const keys = flat(lang, script);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(cases)('(%s,%s): is arranged into 3–4 rows', (lang, script) => {
    const rows = getLayout(lang, script);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.length).toBeLessThanOrEqual(4);
    for (const row of rows) {
      expect(row.length).toBeGreaterThan(0);
      expect(row.length).toBeLessThanOrEqual(10);
    }
  });
});
