import type { GridData } from "@/game/gridData.types";
import {
  cellEntry,
  checkCell,
  clearLetter,
  createGameState,
  isSolved,
  moveCursor,
  setActiveWord,
  setLetter,
  setLetterAt,
} from "@/game/engine";

/**
 * Hand-crafted fixture: a tiny 4x4 grid with two crossing words.
 *
 *   - Across word "wA" (dir across) at row 1, cols 1..3, solution ["NJ","O","S"].
 *     Note the FIRST cell is a DIGRAPH grapheme "NJ" occupying a single cell.
 *   - Down word "wD" (dir down) at col 2, rows 1..2, solution ["O","K"].
 *
 * They share cell (1,2) whose solution is "O" — the intersection. wA index 1
 * and wD index 0 both point at (1,2).
 *
 * Layout (r,c):
 *   (1,1)=NJ  (1,2)=O   (1,3)=S
 *             (2,2)=K
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
      cA: { type: "text", text: "across clue" },
      cD: { type: "text", text: "down clue" },
    },
  };
}

describe("createGameState", () => {
  it("starts with all letter cells empty, not solved, zero mistakes", () => {
    const s = createGameState(makeGrid());
    expect(cellEntry(s, 1, 1)).toBeNull();
    expect(cellEntry(s, 1, 2)).toBeNull();
    expect(cellEntry(s, 1, 3)).toBeNull();
    expect(cellEntry(s, 2, 2)).toBeNull();
    expect(isSolved(s)).toBe(false);
    expect(s.mistakes).toBe(0);
    expect(checkCell(s, 1, 1)).toBe("empty");
  });

  it("does not mutate when calling pure functions (returns new state)", () => {
    const s0 = createGameState(makeGrid());
    const s1 = setActiveWord(s0, "wA");
    expect(s1).not.toBe(s0);
    expect(s0.activeWordId).toBeNull();
  });
});

describe("setActiveWord + setLetter + cursor advance", () => {
  it("writes at the cursor and advances; filling the word correctly marks cells correct", () => {
    let s = createGameState(makeGrid());
    s = setActiveWord(s, "wA");
    expect(s.cursorIndex).toBe(0);

    s = setLetter(s, "NJ");
    expect(cellEntry(s, 1, 1)).toBe("NJ");
    expect(s.cursorIndex).toBe(1); // advanced

    s = setLetter(s, "O");
    s = setLetter(s, "S");

    expect(checkCell(s, 1, 1)).toBe("correct");
    expect(checkCell(s, 1, 2)).toBe("correct");
    expect(checkCell(s, 1, 3)).toBe("correct");
  });

  it("stops the cursor at the word end (does not wrap past last index)", () => {
    let s = createGameState(makeGrid());
    s = setActiveWord(s, "wA");
    s = setLetter(s, "NJ");
    s = setLetter(s, "O");
    s = setLetter(s, "S");
    // After filling last cell, cursor stays clamped at last index (2).
    expect(s.cursorIndex).toBe(2);
  });

  it("moveCursor supports absolute index (number) clamped to the word", () => {
    let s = createGameState(makeGrid());
    s = setActiveWord(s, "wA");
    s = moveCursor(s, 2);
    expect(s.cursorIndex).toBe(2);
    s = moveCursor(s, 99); // clamped to last index
    expect(s.cursorIndex).toBe(2);
    s = moveCursor(s, -5); // clamped to 0
    expect(s.cursorIndex).toBe(0);
  });

  it("moveCursor supports relative delta via { delta } object, clamped", () => {
    let t = createGameState(makeGrid());
    t = setActiveWord(t, "wA");
    t = moveCursor(t, { delta: 1 });
    expect(t.cursorIndex).toBe(1);
    t = moveCursor(t, { delta: 5 });
    expect(t.cursorIndex).toBe(2); // clamped
    t = moveCursor(t, { delta: -10 });
    expect(t.cursorIndex).toBe(0); // clamped
  });
});

describe("intersection", () => {
  it("a shared cell holds ONE value visible from both words", () => {
    let s = createGameState(makeGrid());
    // Fill the across word; (1,2) is the shared cell with value "O".
    s = setActiveWord(s, "wA");
    s = setLetter(s, "NJ");
    s = setLetter(s, "O");

    // Read the shared cell directly.
    expect(cellEntry(s, 1, 2)).toBe("O");

    // Switch to the down word — the shared cell still reads "O".
    s = setActiveWord(s, "wD");
    expect(s.cursorIndex).toBe(0);
    expect(cellEntry(s, 1, 2)).toBe("O");
    expect(checkCell(s, 1, 2)).toBe("correct");

    // Overwriting via the down word updates what the across word sees.
    s = setLetter(s, "X"); // wrong at (1,2)
    expect(cellEntry(s, 1, 2)).toBe("X");
    s = setActiveWord(s, "wA");
    expect(cellEntry(s, 1, 2)).toBe("X");
    expect(checkCell(s, 1, 2)).toBe("wrong");
  });
});

describe("checkCell", () => {
  it("returns empty / correct / wrong appropriately", () => {
    let s = createGameState(makeGrid());
    expect(checkCell(s, 1, 1)).toBe("empty");
    s = setLetterAt(s, 1, 1, "NJ");
    expect(checkCell(s, 1, 1)).toBe("correct");
    s = setLetterAt(s, 1, 1, "X");
    expect(checkCell(s, 1, 1)).toBe("wrong");
  });
});

describe("clearLetter", () => {
  it("empties the cursor cell (backspace)", () => {
    let s = createGameState(makeGrid());
    s = setActiveWord(s, "wA");
    s = setLetter(s, "NJ");
    s = setLetter(s, "O");
    // cursor now at index 2; clearLetter clears at cursor logic.
    // Move cursor back to the "O" cell and clear it.
    s = moveCursor(s, 1);
    s = clearLetter(s);
    expect(cellEntry(s, 1, 2)).toBeNull();
  });
});

describe("mistakes", () => {
  it("increments on a wrong grapheme, not on a correct one", () => {
    let s = createGameState(makeGrid());
    s = setLetterAt(s, 1, 1, "NJ"); // correct
    expect(s.mistakes).toBe(0);
    s = setLetterAt(s, 1, 3, "X"); // wrong
    expect(s.mistakes).toBe(1);
  });

  it("does NOT double-count re-entering the SAME wrong value into an already-wrong cell", () => {
    let s = createGameState(makeGrid());
    s = setLetterAt(s, 1, 3, "X"); // wrong -> mistakes 1
    expect(s.mistakes).toBe(1);
    s = setLetterAt(s, 1, 3, "X"); // same wrong value again -> no increment
    expect(s.mistakes).toBe(1);
  });

  it("DOES count a NEW wrong value placed into an already-wrong cell", () => {
    let s = createGameState(makeGrid());
    s = setLetterAt(s, 1, 3, "X"); // wrong -> 1
    s = setLetterAt(s, 1, 3, "Y"); // different wrong value -> 2
    expect(s.mistakes).toBe(2);
  });

  it("counts each distinct wrong ENTRY (correcting then re-erroring counts again)", () => {
    let s = createGameState(makeGrid());
    s = setLetterAt(s, 1, 3, "X"); // wrong -> 1
    s = setLetterAt(s, 1, 3, "S"); // correct -> still 1
    expect(s.mistakes).toBe(1);
    s = setLetterAt(s, 1, 3, "X"); // wrong again -> 2
    expect(s.mistakes).toBe(2);
  });
});

describe("isSolved", () => {
  it("is true only when every letter cell matches its solution", () => {
    let s = createGameState(makeGrid());
    s = setLetterAt(s, 1, 1, "NJ");
    s = setLetterAt(s, 1, 2, "O");
    s = setLetterAt(s, 1, 3, "S");
    expect(isSolved(s)).toBe(false); // (2,2) still empty
    s = setLetterAt(s, 2, 2, "K");
    expect(isSolved(s)).toBe(true);
  });

  it("is false if one cell is wrong even when all are filled", () => {
    let s = createGameState(makeGrid());
    s = setLetterAt(s, 1, 1, "NJ");
    s = setLetterAt(s, 1, 2, "O");
    s = setLetterAt(s, 1, 3, "S");
    s = setLetterAt(s, 2, 2, "Z"); // wrong
    expect(isSolved(s)).toBe(false);
  });
});
