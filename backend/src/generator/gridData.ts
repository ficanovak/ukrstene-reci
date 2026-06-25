/**
 * gridData SERIALIZATION + SHARED SCHEMA.
 *
 * This module defines the stable JSON contract — `GridData` — that is the
 * single source of truth for a rendered crossword puzzle. It is produced by the
 * generator, stored verbatim in Postgres (as `Json`), shipped over HTTP, and
 * consumed by the mobile client to render the board. Because it crosses the
 * DB and the network it MUST round-trip losslessly through `JSON.stringify` /
 * `JSON.parse`, so the shape uses only plain JSON primitives (no `Map`, `Set`,
 * `undefined`, class instances, etc.).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MODE-AGNOSTIC BY DESIGN (PRD §3 "key rule")
 * ─────────────────────────────────────────────────────────────────────────
 * The SAME gridData drives both Basic and Advanced modes; only the input method
 * differs (tap-to-pick vs. type). Therefore gridData contains NO mode-specific
 * fields. It carries everything either mode needs to:
 *   - RENDER the board: per-cell kind (letter / clue / blank), clue arrows.
 *   - CHECK answers: every letter cell carries its SOLUTION grapheme (the client
 *     shows the cell empty but validates fills against this).
 *   - REVEAL hints: every word lists its cells + solution graphemes, so a whole
 *     word (or a single letter) can be revealed.
 *   - SCORE: words + their solutions give the unit of scoring.
 *   - HIGHLIGHT INTERSECTIONS: each letter cell records which word(s) it belongs
 *     to and at which index, so the client can highlight a crossing word.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CELL KINDS (discriminated union on `kind`)
 * ─────────────────────────────────────────────────────────────────────────
 *   - "letter": part of one or more answers. Carries `solution` (the grapheme,
 *     which may be a digraph like "NJ" occupying ONE cell) and `words`: the list
 *     of { wordId, index } memberships (1 for a normal cell, 2+ at a crossing).
 *   - "clue":   holds a clue. Carries `clueId` (into `clues`) and `dir` (the
 *     arrow direction: "across" points right, "down" points down).
 *   - "blank":  skandinavka filler — neither letter nor clue. Represented
 *     explicitly so the client need not infer emptiness.
 * Every grid coordinate (width*height of them) appears exactly once in `cells`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CLUE CONTENT INJECTION
 * ─────────────────────────────────────────────────────────────────────────
 * At generation time we usually do NOT have final clue text yet (clues are
 * authored/attached by the pipeline, Task 2.7). So:
 *   - Each word gets a deterministic `id` (`"w0"`, `"w1"`, …) and a deterministic
 *     `clueId` (`"c0"`, `"c1"`, …), both assigned in word order.
 *   - `clues[clueId]` is populated either from the caller-supplied `meta.clues`
 *     (keyed by the word's `id`, e.g. `"w0"`) or, if absent, with a placeholder
 *     `{ type: "text", text: "" }`. The pipeline/DB later replaces placeholders
 *     with real authored clue content, keyed by clueId.
 * The STRUCTURE is the contract; clue CONTENT is injectable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SHARED-TYPE LOCATION (single source of truth) — see also README at bottom.
 * ─────────────────────────────────────────────────────────────────────────
 * The canonical `GridData` type is DERIVED from `GridDataSchema` via
 * `z.infer` (schema and type cannot drift). It lives here, in the backend,
 * because zod is a backend dependency and mobile is not yet scaffolded.
 * EXTRACTION PLAN for when mobile exists: move `GridDataSchema` (and the
 * inferred types) into a root `shared/` workspace package `@ukrstene/shared`
 * that both `backend` and `mobile` depend on; Metro/Expo can import the inferred
 * TYPES with zero runtime cost, and may import the schema too if it wants to
 * validate gridData received over HTTP. No structural change is required — only
 * the file moves and the import path changes from `./gridData.js` to
 * `@ukrstene/shared`.
 */

import { z } from "zod";

import { step, type Direction } from "./grid.js";
import type { Layout } from "./layout.js";

/* ─────────────────────────── Zod schema (source of truth) ──────────────── */

const DirectionSchema = z.enum(["across", "down"]);

/** A grid coordinate. */
const CoordSchema = z.object({
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
});

/** One word-membership of a letter cell: which word, and the position in it. */
const CellWordRefSchema = z.object({
  wordId: z.string(),
  index: z.number().int().nonnegative(),
});

/**
 * A letter cell. The client renders it empty but validates fills against
 * `solution` (a single grapheme, possibly a digraph). `words` supports
 * intersection highlighting and word reveal.
 */
const LetterCellSchema = z.object({
  kind: z.literal("letter"),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  solution: z.string(),
  words: z.array(CellWordRefSchema).min(1),
});

/** A clue cell: clue content reference + arrow direction. */
const ClueCellSchema = z.object({
  kind: z.literal("clue"),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
  clueId: z.string(),
  dir: DirectionSchema,
});

/** A blank/unused filler cell. */
const BlankCellSchema = z.object({
  kind: z.literal("blank"),
  row: z.number().int().nonnegative(),
  col: z.number().int().nonnegative(),
});

const CellSchema = z.discriminatedUnion("kind", [
  LetterCellSchema,
  ClueCellSchema,
  BlankCellSchema,
]);

/** One answer: its cells, direction, solution graphemes and clue reference. */
const WordSchema = z.object({
  id: z.string(),
  dir: DirectionSchema,
  /** Letter-cell coordinates in reading order. */
  cells: z.array(CoordSchema).min(1),
  /** One grapheme per cell (digraphs stay single entries). */
  solution: z.array(z.string()).min(1),
  /** Reference into `clues`. */
  clueId: z.string(),
  /** The clue cell's coordinate (arrow origin). */
  clueCell: CoordSchema,
});

/** Clue content. `text`/`imageRef` are optional so placeholders are valid. */
const ClueSchema = z.object({
  type: z.enum(["text", "image"]),
  text: z.string().optional(),
  imageRef: z.string().optional(),
  /** Optional personality/voice the clue is authored in. */
  personalityRef: z.string().optional(),
});

/**
 * The complete gridData contract. `cells` holds EVERY grid coordinate exactly
 * once (length === width*height). `clues` is keyed by clueId.
 */
export const GridDataSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cells: z.array(CellSchema),
  words: z.array(WordSchema),
  clues: z.record(z.string(), ClueSchema),
});

/* ──────────────────────────── Inferred types (single source) ───────────── */

export type Coord = z.infer<typeof CoordSchema>;
export type CellWordRef = z.infer<typeof CellWordRefSchema>;
export type LetterCell = z.infer<typeof LetterCellSchema>;
export type ClueCell = z.infer<typeof ClueCellSchema>;
export type BlankCell = z.infer<typeof BlankCellSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type Word = z.infer<typeof WordSchema>;
export type Clue = z.infer<typeof ClueSchema>;
export type GridData = z.infer<typeof GridDataSchema>;

/** Clue content the caller may inject, keyed by wordId (`"w0"`, `"w1"`, …). */
export interface GridDataMeta {
  clues?: Record<string, Clue>;
}

/* ──────────────────────────────── Serializer ───────────────────────────── */

/** Deterministic wordId for the i-th placed word. */
function wordIdOf(i: number): string {
  return `w${i}`;
}

/** Deterministic clueId for the i-th placed word (1 clue per word in v1). */
function clueIdOf(i: number): string {
  return `c${i}`;
}

function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

/**
 * Serializes a generated `Layout` into the stable `gridData` JSON structure.
 *
 * Clue CONTENT is optional at this stage: pass `meta.clues` keyed by wordId to
 * inject authored clues; any word without injected content gets a placeholder
 * `{ type: "text", text: "" }` that the pipeline (Task 2.7) replaces later. The
 * STRUCTURE (cells/words/clues wiring) is fully determined here.
 */
export function serializeGridData(layout: Layout, meta?: GridDataMeta): GridData {
  const { width, height } = layout;

  // 1. Build letter-cell metadata: for each occupied coordinate, the list of
  //    (wordId, index) memberships. Crossings naturally accumulate 2+ entries.
  const letterMembers = new Map<string, CellWordRef[]>();
  const letterSolution = new Map<string, string>();

  layout.words.forEach((w, i) => {
    const wordId = wordIdOf(i);
    const { dRow, dCol } = step(w.dir);
    for (let j = 0; j < w.graphemes.length; j++) {
      const r = w.row + dRow * j;
      const c = w.col + dCol * j;
      const k = coordKey(r, c);
      const list = letterMembers.get(k);
      if (list) {
        list.push({ wordId, index: j });
      } else {
        letterMembers.set(k, [{ wordId, index: j }]);
      }
      letterSolution.set(k, w.graphemes[j]);
    }
  });

  // 2. Build clue-cell metadata: clue cell coordinate → clueId + arrow dir.
  const clueCells = new Map<string, { clueId: string; dir: Direction }>();
  layout.words.forEach((w, i) => {
    clueCells.set(coordKey(w.clueRow, w.clueCol), {
      clueId: clueIdOf(i),
      dir: w.dir,
    });
  });

  // 3. Emit every grid coordinate exactly once, in row-major order, classifying
  //    it as letter / clue / blank. Letter takes precedence is impossible here:
  //    the layout builder guarantees clue cells never coincide with letter cells.
  const cells: Cell[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const k = coordKey(row, col);
      const members = letterMembers.get(k);
      if (members) {
        cells.push({
          kind: "letter",
          row,
          col,
          solution: letterSolution.get(k)!,
          words: members,
        });
        continue;
      }
      const clue = clueCells.get(k);
      if (clue) {
        cells.push({ kind: "clue", row, col, clueId: clue.clueId, dir: clue.dir });
        continue;
      }
      cells.push({ kind: "blank", row, col });
    }
  }

  // 4. Emit words.
  const words: Word[] = layout.words.map((w, i) => {
    const { dRow, dCol } = step(w.dir);
    const wordCells: Coord[] = [];
    for (let j = 0; j < w.graphemes.length; j++) {
      wordCells.push({ row: w.row + dRow * j, col: w.col + dCol * j });
    }
    return {
      id: wordIdOf(i),
      dir: w.dir,
      cells: wordCells,
      solution: w.graphemes.slice(),
      clueId: clueIdOf(i),
      clueCell: { row: w.clueRow, col: w.clueCol },
    };
  });

  // 5. Emit clues: injected content (keyed by wordId) or a placeholder per word.
  const clues: Record<string, Clue> = {};
  layout.words.forEach((_w, i) => {
    const injected = meta?.clues?.[wordIdOf(i)];
    clues[clueIdOf(i)] = injected ?? { type: "text", text: "" };
  });

  return { width, height, cells, words, clues };
}

/**
 * Validates an unknown value against `GridDataSchema` and returns a typed
 * `GridData`. THROWS (`ZodError`) on any structural violation — used to guard
 * gridData read back from Postgres or received over HTTP.
 */
export function parseGridData(json: unknown): GridData {
  return GridDataSchema.parse(json);
}
