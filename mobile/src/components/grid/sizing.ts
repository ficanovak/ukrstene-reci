/**
 * Pure cell-sizing math for the crossword grid renderer.
 *
 * SIZING STRATEGY (PRD §4.3 — "width 6–9 must fit, no horizontal scroll")
 * ─────────────────────────────────────────────────────────────────────────
 * The grid is square-celled: every cell is `cellSize × cellSize`. We size the
 * cell so the WHOLE board fits the available WIDTH:
 *
 *     cellSize = floor(availableWidth / gridWidth)
 *
 * Flooring guarantees `cellSize * gridWidth <= availableWidth` — i.e. the board
 * never overflows horizontally, so no horizontal scroll is ever required. This
 * is the binding constraint per the PRD; width 6–9 on any phone yields a
 * comfortable, touch-sized cell.
 *
 * HEIGHT (secondary, optional clamp). The PRD allows up to 12 rows and accepts a
 * board taller than the viewport (the screen scrolls vertically). But when a
 * `maxHeight` is supplied we ALSO clamp so the board fits vertically when it
 * reasonably can:
 *
 *     cellSize = min(floor(availableWidth / gridWidth),
 *                    floor(maxHeight / gridHeight))   // only if maxHeight given
 *
 * This keeps short, wide boards from looking oversized while never violating the
 * width constraint (the width term is always an upper bound).
 *
 * MIN TOUCH SIZE. We never let a cell render absurdly small: `MIN_CELL_SIZE`
 * floors the result for legibility/touch. For widths 6–9 on a phone the natural
 * size is well above this, so the clamp is inert in the common case; it only
 * engages for pathological inputs (e.g. a tiny `availableWidth`), in which case
 * the caller may scroll. We clamp to at least 1 to avoid a zero/negative size.
 */

/** Below this, cells get hard to tap/read. Inert for 6–9 wide boards on phones. */
export const MIN_CELL_SIZE = 28;

/**
 * Computes the integer side length (px) of a single square cell.
 *
 * @param availableWidth  Usable width in px (e.g. screen width minus padding).
 * @param gridWidth       Number of columns (must be >= 1).
 * @param gridHeight      Number of rows (used only with `maxHeight`).
 * @param maxHeight       Optional usable height in px; when given, the result is
 *                        also clamped so the board fits vertically when possible.
 * @returns integer cellSize, guaranteed `cellSize * gridWidth <= availableWidth`.
 */
export function computeCellSize(
  availableWidth: number,
  gridWidth: number,
  gridHeight?: number,
  maxHeight?: number,
): number {
  if (gridWidth < 1) {
    throw new Error(`computeCellSize: gridWidth must be >= 1, got ${gridWidth}`);
  }

  // Width is the binding constraint — floor so the board never overflows.
  let size = Math.floor(availableWidth / gridWidth);

  // Optional vertical fit: only tighten, never widen past the width bound.
  if (maxHeight !== undefined && gridHeight !== undefined && gridHeight >= 1) {
    size = Math.min(size, Math.floor(maxHeight / gridHeight));
  }

  // Never below the touch/legibility floor; never zero or negative.
  return Math.max(MIN_CELL_SIZE, Math.max(1, size));
}
