/**
 * Tests for the hint system (Task 7.2).
 *
 * Two hints per level — one reveals the active WORD, one reveals a single
 * LETTER cell. Each usable once. Availability is driven by a pluggable
 * HintProvider (v1: free-per-level) so a future inventory/ads model drops in
 * without touching gameplay. Using a hint flags it for scoring (`hintsUsed`).
 *
 * The reveal LOGIC is shared across modes (write the correct solution grapheme
 * into the target cells of the base GameState). The Advanced screen additionally
 * LOCKS those cells — covered here against an AdvancedState fixture via
 * `lockRevealed`.
 */
import { checkCell, createGameState, setActiveWord, type GameState } from "@/game/engine";
import {
  createAdvancedState,
  type AdvancedState,
} from "@/game/advanced";
import {
  applyLetterHint,
  applyWordHint,
  createHintState,
  freePerLevelProvider,
  lockRevealed,
  type HintProvider,
} from "@/game/hints";
import type { GridData } from "@/game/gridData.types";

/**
 * Tiny 4x4 fixture (same shape as engine.test.ts):
 *   wA across (1,1..3) = ["NJ","O","S"]; wD down (1,2)+(2,2) = ["O","K"].
 */
function makeGrid(): GridData {
  return {
    width: 4,
    height: 4,
    cells: [
      { kind: "letter", row: 1, col: 1, solution: "NJ", words: [{ wordId: "wA", index: 0 }] },
      {
        kind: "letter",
        row: 1,
        col: 2,
        solution: "O",
        words: [
          { wordId: "wA", index: 1 },
          { wordId: "wD", index: 0 },
        ],
      },
      { kind: "letter", row: 1, col: 3, solution: "S", words: [{ wordId: "wA", index: 2 }] },
      { kind: "letter", row: 2, col: 2, solution: "K", words: [{ wordId: "wD", index: 1 }] },
      { kind: "clue", row: 0, col: 1, clueId: "cA", dir: "across" },
      { kind: "clue", row: 0, col: 2, clueId: "cD", dir: "down" },
      { kind: "blank", row: 0, col: 0 },
    ],
    words: [
      {
        id: "wA",
        dir: "across",
        cells: [
          { row: 1, col: 1 },
          { row: 1, col: 2 },
          { row: 1, col: 3 },
        ],
        solution: ["NJ", "O", "S"],
        clueId: "cA",
        clueCell: { row: 0, col: 1 },
      },
      {
        id: "wD",
        dir: "down",
        cells: [
          { row: 1, col: 2 },
          { row: 2, col: 2 },
        ],
        solution: ["O", "K"],
        clueId: "cD",
        clueCell: { row: 0, col: 2 },
      },
    ],
    clues: {
      cA: { type: "text", text: "across" },
      cD: { type: "text", text: "down" },
    },
  };
}

/** A GameState with `wA` active and the cursor on its first cell. */
function basicWithActiveWord(): GameState {
  return setActiveWord(createGameState(makeGrid()), "wA");
}

describe("HintProvider / createHintState", () => {
  it("free-per-level provider grants exactly 1 word + 1 letter hint", () => {
    const hints = createHintState(freePerLevelProvider());
    expect(hints.wordRemaining).toBe(true);
    expect(hints.letterRemaining).toBe(true);
    expect(hints.hintsUsed).toBe(0);
  });

  it("availability is provider-driven: a provider giving 0 word hints disables word hint from the start", () => {
    const noWord: HintProvider = {
      grant: () => ({ word: 0, letter: 1 }),
    };
    const hints = createHintState(noWord);
    expect(hints.wordRemaining).toBe(false);
    expect(hints.letterRemaining).toBe(true);
    expect(hints.hintsUsed).toBe(0);
  });
});

describe("applyWordHint", () => {
  it("reveals every cell of the active word with the correct grapheme", () => {
    const game = basicWithActiveWord();
    const hints = createHintState(freePerLevelProvider());

    const res = applyWordHint(game, hints, "wA");

    // All three wA cells now hold their solution graphemes.
    expect(checkCell(res.game, 1, 1)).toBe("correct");
    expect(checkCell(res.game, 1, 2)).toBe("correct");
    expect(checkCell(res.game, 1, 3)).toBe("correct");

    expect(res.hints.wordRemaining).toBe(false);
    expect(res.hints.hintsUsed).toBe(1);
    // Letter hint untouched.
    expect(res.hints.letterRemaining).toBe(true);
  });

  it("is a no-op when the word hint is already used", () => {
    const game = basicWithActiveWord();
    const hints = createHintState(freePerLevelProvider());

    const first = applyWordHint(game, hints, "wA");
    const second = applyWordHint(first.game, first.hints, "wD");

    // Second attempt rejected: state unchanged, count not bumped.
    expect(second.hints.hintsUsed).toBe(1);
    expect(second.game).toBe(first.game);
    // wD remains unrevealed.
    expect(checkCell(second.game, 2, 2)).toBe("empty");
  });

  it("is a no-op when there is no active word (null wordId)", () => {
    const game = createGameState(makeGrid());
    const hints = createHintState(freePerLevelProvider());
    const res = applyWordHint(game, hints, null);
    expect(res.game).toBe(game);
    expect(res.hints.hintsUsed).toBe(0);
    expect(res.hints.wordRemaining).toBe(true);
  });
});

describe("applyLetterHint", () => {
  it("reveals the target cell with the correct grapheme", () => {
    const game = basicWithActiveWord();
    const hints = createHintState(freePerLevelProvider());

    const res = applyLetterHint(game, hints, 1, 1);

    expect(checkCell(res.game, 1, 1)).toBe("correct");
    expect(res.hints.letterRemaining).toBe(false);
    expect(res.hints.hintsUsed).toBe(1);
    expect(res.hints.wordRemaining).toBe(true);
  });

  it("is a no-op when the letter hint is already used", () => {
    const game = basicWithActiveWord();
    const hints = createHintState(freePerLevelProvider());
    const first = applyLetterHint(game, hints, 1, 1);
    const second = applyLetterHint(first.game, first.hints, 1, 3);
    expect(second.hints.hintsUsed).toBe(1);
    expect(second.game).toBe(first.game);
    expect(checkCell(second.game, 1, 3)).toBe("empty");
  });
});

describe("both hints together", () => {
  it("using word + letter ⇒ hintsUsed 2, both remaining false", () => {
    const game = basicWithActiveWord();
    let hints = createHintState(freePerLevelProvider());

    const a = applyWordHint(game, hints, "wA");
    const b = applyLetterHint(a.game, a.hints, 2, 2);

    expect(b.hints.hintsUsed).toBe(2);
    expect(b.hints.wordRemaining).toBe(false);
    expect(b.hints.letterRemaining).toBe(false);
    void hints;
  });
});

describe("Advanced application (lockRevealed)", () => {
  it("word hint reveals + locks all the word's cells in the AdvancedState", () => {
    const adv = createAdvancedState(makeGrid(), 1);
    const hints = createHintState(freePerLevelProvider());

    const res = applyWordHint(adv.base, hints, "wA");
    const next: AdvancedState = lockRevealed(adv, res.game, [
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ]);

    expect(next.locked.has("1,1")).toBe(true);
    expect(next.locked.has("1,2")).toBe(true);
    expect(next.locked.has("1,3")).toBe(true);
    // The revealed cells carry the correct solution in the base fill.
    expect(checkCell(next.base, 1, 1)).toBe("correct");
    expect(res.hints.hintsUsed).toBe(1);
  });

  it("letter hint reveals + locks one cell in the AdvancedState", () => {
    const adv = createAdvancedState(makeGrid(), 1);
    const hints = createHintState(freePerLevelProvider());

    const res = applyLetterHint(adv.base, hints, 2, 2);
    const next = lockRevealed(adv, res.game, [{ row: 2, col: 2 }]);

    expect(next.locked.has("2,2")).toBe(true);
    expect(checkCell(next.base, 2, 2)).toBe("correct");
    expect(res.hints.hintsUsed).toBe(1);
  });
});
