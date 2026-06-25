/**
 * Mobile-side TypeScript type for `GridData` — the serialized crossword payload
 * produced by the backend generator, stored in the DB, and shipped over HTTP.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH / KEEP IN SYNC
 * ─────────────────────────────────────────────────────────────────────────
 * The authoritative definition is the zod `GridDataSchema` (and its `z.infer`
 * types) in `backend/src/generator/gridData.ts`. This file is a HAND-MIRRORED
 * copy of that contract so the mobile engine + renderer can be strongly typed
 * without depending on zod. The two MUST stay structurally identical.
 *
 * This duplication is deliberate and temporary: per the Task 2.6 plan, the
 * schema + inferred types will be hoisted into a root workspace package
 * `@ukrstene/shared` that both `backend` and `mobile` depend on, at which point
 * this file is replaced by `import type { GridData, ... } from '@ukrstene/shared'`.
 * Until then: any change to the backend `GridDataSchema` MUST be reflected here.
 *
 * Field names + shapes verified against backend/src/generator/gridData.ts.
 */

/** Word/clue arrow direction. */
export type Direction = "across" | "down";

/** A grid coordinate. */
export interface Coord {
  row: number;
  col: number;
}

/** One word-membership of a letter cell: which word, and the position in it. */
export interface CellWordRef {
  wordId: string;
  index: number;
}

/**
 * A letter cell. The client renders it empty but validates fills against
 * `solution` (a single grapheme, possibly a digraph like "NJ" occupying ONE
 * cell). `words` lists this cell's memberships (1 normally, 2+ at a crossing).
 */
export interface LetterCell {
  kind: "letter";
  row: number;
  col: number;
  solution: string;
  words: CellWordRef[];
}

/** A clue cell: clue content reference + arrow direction. */
export interface ClueCell {
  kind: "clue";
  row: number;
  col: number;
  clueId: string;
  dir: Direction;
}

/** A blank/unused filler cell. */
export interface BlankCell {
  kind: "blank";
  row: number;
  col: number;
}

/** Discriminated union on `kind`. */
export type Cell = LetterCell | ClueCell | BlankCell;

/** One answer: its cells, direction, solution graphemes and clue reference. */
export interface Word {
  id: string;
  dir: Direction;
  /** Letter-cell coordinates in reading order. */
  cells: Coord[];
  /** One grapheme per cell (digraphs stay single entries). */
  solution: string[];
  /** Reference into `clues`. */
  clueId: string;
  /** The clue cell's coordinate (arrow origin). */
  clueCell: Coord;
}

/** Clue content. `text`/`imageRef` are optional so placeholders are valid. */
export interface Clue {
  type: "text" | "image";
  text?: string;
  imageRef?: string;
  /** Optional personality/voice the clue is authored in. */
  personalityRef?: string;
}

/**
 * The complete gridData contract. `cells` holds EVERY grid coordinate exactly
 * once (length === width*height). `clues` is keyed by clueId.
 */
export interface GridData {
  width: number;
  height: number;
  cells: Cell[];
  words: Word[];
  clues: Record<string, Clue>;
}
