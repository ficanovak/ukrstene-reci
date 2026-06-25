import { computeCellSize, MIN_CELL_SIZE } from './sizing';

describe('computeCellSize', () => {
  it('floors so the board never overflows the available width (no h-scroll)', () => {
    // 393px is a common phone width (iPhone 14/15). For every grid width 6–9
    // the laid-out board must fit within the available width.
    for (let w = 6; w <= 9; w++) {
      const size = computeCellSize(393, w);
      expect(size * w).toBeLessThanOrEqual(393);
    }
  });

  it('uses floor(availableWidth / gridWidth) when above the min', () => {
    expect(computeCellSize(360, 6)).toBe(60); // 360/6 = 60
    expect(computeCellSize(350, 9)).toBe(38); // floor(38.8) = 38
  });

  it('produces a touch-comfortable cell for widths 6–9 on a phone', () => {
    for (let w = 6; w <= 9; w++) {
      expect(computeCellSize(393, w)).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
    }
  });

  it('clamps to MIN_CELL_SIZE for pathologically small widths', () => {
    // 100px across 9 columns would be ~11px/cell — clamp up to the floor.
    expect(computeCellSize(100, 9)).toBe(MIN_CELL_SIZE);
  });

  it('also fits height when maxHeight is supplied (takes the tighter dimension)', () => {
    // Wide-but-short viewport: 600px wide, 6 cols => 100px by width, but only
    // 300px tall over 4 rows => 75px by height. Height wins.
    const size = computeCellSize(600, 6, 4, 300);
    expect(size).toBe(75);
    expect(size * 6).toBeLessThanOrEqual(600);
    expect(size * 4).toBeLessThanOrEqual(300);
  });

  it('ignores maxHeight when width is the tighter constraint', () => {
    // 360px/6 = 60 by width; height allows up to 80 — width still wins.
    expect(computeCellSize(360, 6, 5, 400)).toBe(60);
  });

  it('never returns zero or negative', () => {
    expect(computeCellSize(1, 9)).toBeGreaterThanOrEqual(1);
  });

  it('throws on a non-positive grid width', () => {
    expect(() => computeCellSize(300, 0)).toThrow();
  });
});
