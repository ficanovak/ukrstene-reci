import { darkColors, lightColors, type ThemeColors } from './colors';

/**
 * These tests pin the EXACT palette values from the PRD so that a typo in a
 * hex code is caught immediately, and guarantee both palettes share the same
 * shape so components can switch between them seamlessly.
 */
describe('light palette "Topla enigmatika" (PRD §10.1)', () => {
  it('uses the exact PRD hex values', () => {
    expect(lightColors.background).toBe('#FAF7F2');
    expect(lightColors.primary).toBe('#0E7C86');
    expect(lightColors.secondary).toBe('#F4B740');
    expect(lightColors.clueCell).toBe('#EAF0F5');
    expect(lightColors.correct).toBe('#3FB984');
    expect(lightColors.wrong).toBe('#E5604D');
    expect(lightColors.text).toBe('#22272B');
  });
});

describe('dark palette "Tamna tema" (PRD §10.2)', () => {
  it('uses the PRD-fixed background', () => {
    expect(darkColors.background).toBe('#161A1D');
  });

  it('keeps the PRD invariant: correct/coral stay the same as light', () => {
    expect(darkColors.correct).toBe(lightColors.correct);
    expect(darkColors.wrong).toBe(lightColors.wrong);
  });
});

describe('palette shape', () => {
  it('light and dark expose an identical set of keys', () => {
    const lightKeys = Object.keys(lightColors).sort();
    const darkKeys = Object.keys(darkColors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it('exposes the full set of semantic tokens', () => {
    const expected: (keyof ThemeColors)[] = [
      'background',
      'primary',
      'secondary',
      'clueCell',
      'correct',
      'wrong',
      'text',
    ];
    expect(Object.keys(lightColors).sort()).toEqual([...expected].sort());
  });

  it('every value is a 6-digit hex string', () => {
    const allValues = [...Object.values(lightColors), ...Object.values(darkColors)];
    for (const value of allValues) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
