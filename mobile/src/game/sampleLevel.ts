/**
 * A hand-crafted, VALID sample skandinavka level (Task 5.4).
 *
 * WHY THIS EXISTS
 * ───────────────────────────────────────────────────────────────────────────
 * Basic mode (the playable screen) needs a level to render. In production those
 * come from the SQLite level cache (Task 4.3), which is filled by the sync layer
 * from the backend. During DEV / OFFLINE first-run the cache is empty, so the
 * screen would have nothing to show. This module is the bundled fallback the
 * loader hook (`useLevel`) drops to when `levelRepo.getNextLevel(...)` returns
 * null — so Basic mode is playable on a fresh simulator WITHOUT a backend.
 *
 * It is a small but real Serbian-Latin mini puzzle, deliberately authored so the
 * crossings are internally consistent (a cell shared by two words holds the SAME
 * grapheme in both words' solutions — verified below).
 *
 * THE PUZZLE
 * ───────────────────────────────────────────────────────────────────────────
 * Three crossing common words (uppercase, as crosswords are):
 *
 *   col→   0      1     2      3      4
 * row 0          ·    [OKO↓] [RAME↓]  ·
 * row 1  [MORE→] M     O      R      E
 * row 2          ·     K      A       ·
 * row 3          ·     O      M       ·
 * row 4          ·     ·      E       ·
 *
 *   MORE (across) — "Velika slana voda" (sea)        → M O R E   at row 1
 *   OKO  (down)   — "Organ vida" (eye)               → O K O     from (1,2)
 *   RAME (down)   — "Deo tela uz vrat" (shoulder)    → R A M E   from (1,3)
 *
 * CROSSINGS (consistency check):
 *   (1,2): MORE[1]='O'  ==  OKO[0]='O'   ✓
 *   (1,3): MORE[2]='R'  ==  RAME[0]='R'  ✓
 *
 * Clue cells (the skandinavka definition arrows):
 *   (1,0) across → MORE
 *   (0,2) down   → OKO
 *   (0,3) down   → RAME
 *
 * Everything else is a blank filler cell. `cells` lists EVERY coordinate of the
 * 5×5 board exactly once (length === width*height === 25), per the GridData
 * contract.
 *
 * NOTE ON SCRIPT: solutions are Latin graphemes, so this fallback is meant for
 * the Latin keyboard (sr/lat — the default script). It is a dev fixture; real
 * Cyrillic content comes from the backend cache.
 */
import type { Cell, GridData } from './gridData.types';

/** Stable id for the bundled fallback (distinguishable from server level ids). */
export const SAMPLE_LEVEL_ID = 'sample-basic-1';

const WIDTH = 5;
const HEIGHT = 5;

/**
 * Build the full cell list. We start with every coordinate as a blank, then
 * overwrite the clue + letter cells. This guarantees `cells.length === 25` and
 * that each coordinate appears exactly once.
 */
function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      cells.push({ kind: 'blank', row, col });
    }
  }

  const at = (row: number, col: number) => row * WIDTH + col;
  const setCell = (cell: Cell) => {
    cells[at(cell.row, cell.col)] = cell;
  };

  // ── Clue cells (arrow origins) ────────────────────────────────────────────
  setCell({ kind: 'clue', row: 1, col: 0, clueId: 'clue-more', dir: 'across' });
  setCell({ kind: 'clue', row: 0, col: 2, clueId: 'clue-oko', dir: 'down' });
  setCell({ kind: 'clue', row: 0, col: 3, clueId: 'clue-rame', dir: 'down' });

  // ── Letter cells. `words` lists this cell's memberships (2 at a crossing). ──
  // MORE (across): (1,1)M (1,2)O (1,3)R (1,4)E
  setCell({ kind: 'letter', row: 1, col: 1, solution: 'M', words: [{ wordId: 'more', index: 0 }] });
  setCell({
    kind: 'letter', row: 1, col: 2, solution: 'O',
    words: [{ wordId: 'more', index: 1 }, { wordId: 'oko', index: 0 }],
  });
  setCell({
    kind: 'letter', row: 1, col: 3, solution: 'R',
    words: [{ wordId: 'more', index: 2 }, { wordId: 'rame', index: 0 }],
  });
  setCell({ kind: 'letter', row: 1, col: 4, solution: 'E', words: [{ wordId: 'more', index: 3 }] });

  // OKO (down): (1,2)O (2,2)K (3,2)O  — first cell shared with MORE above.
  setCell({ kind: 'letter', row: 2, col: 2, solution: 'K', words: [{ wordId: 'oko', index: 1 }] });
  setCell({ kind: 'letter', row: 3, col: 2, solution: 'O', words: [{ wordId: 'oko', index: 2 }] });

  // RAME (down): (1,3)R (2,3)A (3,3)M (4,3)E — first cell shared with MORE above.
  setCell({ kind: 'letter', row: 2, col: 3, solution: 'A', words: [{ wordId: 'rame', index: 1 }] });
  setCell({ kind: 'letter', row: 3, col: 3, solution: 'M', words: [{ wordId: 'rame', index: 2 }] });
  setCell({ kind: 'letter', row: 4, col: 3, solution: 'E', words: [{ wordId: 'rame', index: 3 }] });

  return cells;
}

/** The bundled sample level. Internally consistent (see crossing check above). */
export const sampleLevel: GridData = {
  width: WIDTH,
  height: HEIGHT,
  cells: buildCells(),
  words: [
    {
      id: 'more',
      dir: 'across',
      cells: [
        { row: 1, col: 1 },
        { row: 1, col: 2 },
        { row: 1, col: 3 },
        { row: 1, col: 4 },
      ],
      solution: ['M', 'O', 'R', 'E'],
      clueId: 'clue-more',
      clueCell: { row: 1, col: 0 },
    },
    {
      id: 'oko',
      dir: 'down',
      cells: [
        { row: 1, col: 2 },
        { row: 2, col: 2 },
        { row: 3, col: 2 },
      ],
      solution: ['O', 'K', 'O'],
      clueId: 'clue-oko',
      clueCell: { row: 0, col: 2 },
    },
    {
      id: 'rame',
      dir: 'down',
      cells: [
        { row: 1, col: 3 },
        { row: 2, col: 3 },
        { row: 3, col: 3 },
        { row: 4, col: 3 },
      ],
      solution: ['R', 'A', 'M', 'E'],
      clueId: 'clue-rame',
      clueCell: { row: 0, col: 3 },
    },
  ],
  clues: {
    'clue-more': { type: 'text', text: 'Velika slana voda' },
    'clue-oko': { type: 'text', text: 'Organ vida' },
    'clue-rame': { type: 'text', text: 'Deo tela uz vrat' },
  },
};
