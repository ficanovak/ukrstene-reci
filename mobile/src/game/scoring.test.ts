import {
  HINT_WEIGHT,
  MAX_STARS,
  MIN_STARS,
  NUM_BANDS,
  STAR_THRESHOLDS,
  scoreLevel,
} from "@/game/scoring";

describe("scoreLevel — perfect solve", () => {
  it("returns 5 stars for 0 mistakes + 0 hints on any band", () => {
    for (let band = 1; band <= NUM_BANDS; band++) {
      const r = scoreLevel({ mistakes: 0, hintsUsed: 0, difficultyBand: band });
      expect(r.stars).toBe(5);
    }
  });

  it("a perfect solve has the maximum score for its band", () => {
    const easy = scoreLevel({ mistakes: 0, hintsUsed: 0, difficultyBand: 1 });
    const hard = scoreLevel({ mistakes: 0, hintsUsed: 0, difficultyBand: 20 });
    // harder bands are worth more
    expect(hard.score).toBeGreaterThan(easy.score);
  });
});

describe("scoreLevel — mistakes monotonicity", () => {
  it("more mistakes never increases stars and never increases score", () => {
    const band = 5;
    let prevStars = MAX_STARS + 1;
    let prevScore = Infinity;
    for (let m = 0; m <= 30; m++) {
      const r = scoreLevel({ mistakes: m, hintsUsed: 0, difficultyBand: band });
      expect(r.stars).toBeLessThanOrEqual(prevStars);
      expect(r.score).toBeLessThanOrEqual(prevScore);
      prevStars = r.stars;
      prevScore = r.score;
    }
  });

  it("enough mistakes drives the rating down to the 1-star floor", () => {
    const r = scoreLevel({ mistakes: 50, hintsUsed: 0, difficultyBand: 1 });
    expect(r.stars).toBe(1);
  });
});

describe("scoreLevel — band forgiveness", () => {
  it("the SAME mistake count yields >= stars on a higher band (monotonic in band)", () => {
    const mistakes = 4;
    let prev = MIN_STARS - 1;
    for (let band = 1; band <= NUM_BANDS; band++) {
      const r = scoreLevel({ mistakes, hintsUsed: 0, difficultyBand: band });
      expect(r.stars).toBeGreaterThanOrEqual(prev);
      prev = r.stars;
    }
  });

  it("is STRICTLY more forgiving at the extremes for a chosen mistake count", () => {
    const mistakes = 4;
    const easy = scoreLevel({ mistakes, hintsUsed: 0, difficultyBand: 1 });
    const hard = scoreLevel({ mistakes, hintsUsed: 0, difficultyBand: 20 });
    expect(hard.stars).toBeGreaterThan(easy.stars);
  });
});

describe("scoreLevel — hint penalty", () => {
  it("hints reduce stars vs a perfect game", () => {
    const perfect = scoreLevel({ mistakes: 0, hintsUsed: 0, difficultyBand: 1 });
    const withHints = scoreLevel({ mistakes: 0, hintsUsed: 4, difficultyBand: 1 });
    expect(withHints.stars).toBeLessThan(perfect.stars);
  });

  it("a single hint with 0 mistakes is still a high rating (4 stars) on band 1", () => {
    const r = scoreLevel({ mistakes: 0, hintsUsed: 1, difficultyBand: 1 });
    expect(r.stars).toBe(4);
  });

  it("a hint costs HINT_WEIGHT mistakes-equivalent (0 mistakes + 1 hint == HINT_WEIGHT mistakes + 0 hints)", () => {
    const viaHint = scoreLevel({ mistakes: 0, hintsUsed: 1, difficultyBand: 3 });
    const viaMistakes = scoreLevel({
      mistakes: HINT_WEIGHT,
      hintsUsed: 0,
      difficultyBand: 3,
    });
    expect(viaHint.stars).toBe(viaMistakes.stars);
  });
});

describe("scoreLevel — invariants & clamps", () => {
  it("stars always in [1,5] and score >= 0 across a wide sweep", () => {
    for (let band = 1; band <= NUM_BANDS; band++) {
      for (let m = 0; m <= 40; m++) {
        for (const h of [0, 1, 3, 10]) {
          const r = scoreLevel({
            mistakes: m,
            hintsUsed: h,
            difficultyBand: band,
          });
          expect(r.stars).toBeGreaterThanOrEqual(MIN_STARS);
          expect(r.stars).toBeLessThanOrEqual(MAX_STARS);
          expect(r.score).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(r.score)).toBe(true);
        }
      }
    }
  });

  it("very large mistakes clamp at 1 star (never 0)", () => {
    const r = scoreLevel({
      mistakes: 1_000_000,
      hintsUsed: 1_000_000,
      difficultyBand: 20,
    });
    expect(r.stars).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it("clamps an out-of-range band into 1..NUM_BANDS rather than throwing", () => {
    const below = scoreLevel({ mistakes: 4, hintsUsed: 0, difficultyBand: 0 });
    const at1 = scoreLevel({ mistakes: 4, hintsUsed: 0, difficultyBand: 1 });
    const above = scoreLevel({ mistakes: 4, hintsUsed: 0, difficultyBand: 999 });
    const atMax = scoreLevel({
      mistakes: 4,
      hintsUsed: 0,
      difficultyBand: NUM_BANDS,
    });
    expect(below.stars).toBe(at1.stars);
    expect(above.stars).toBe(atMax.stars);
  });

  it("normalizes fractional / negative inputs defensively", () => {
    const r = scoreLevel({
      mistakes: -5,
      hintsUsed: -2,
      difficultyBand: 1,
    });
    // negatives treated as 0 → perfect
    expect(r.stars).toBe(5);
  });
});

describe("STAR_THRESHOLDS shape", () => {
  it("has one ascending threshold per dropped star tier (4 entries: for 4,3,2,1 stars)", () => {
    expect(STAR_THRESHOLDS.length).toBe(4);
    for (let i = 1; i < STAR_THRESHOLDS.length; i++) {
      expect(STAR_THRESHOLDS[i]).toBeGreaterThan(STAR_THRESHOLDS[i - 1]);
    }
    // first threshold is > 0 so a single penalty point still > drops below 5★
    expect(STAR_THRESHOLDS[0]).toBeGreaterThan(0);
  });
});
