/**
 * BULK LEVEL GENERATION (Task 2.8).
 *
 * Composes the single-level pipeline (`generateLevel`, Task 2.7) into a batch
 * job that fills many level NUMBERS — each with several table VARIATIONS — and
 * persists them to Postgres via Prisma. The core function here is pure-ish: it
 * takes an INJECTED Prisma client (so tests run against the test DB) and an
 * INJECTED dictionary (so the core does not depend on DB-loaded words), and
 * returns a summary. The thin CLI wrapper (src/jobs/runBulkGenerate.ts) wires
 * the runtime client + loads the dictionary from the DB.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POLICY DECISIONS (documented as required by the task)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. LEVEL NUMBER → TARGET BAND. We INVERT the band→level tiling defined by
 *    `levelNumberRange` in difficulty.ts. That function tiles the level space
 *    contiguously and ascending: band b owns level numbers
 *    (b-1)*LEVELS_PER_BAND+1 .. b*LEVELS_PER_BAND. Inverting it, a level number
 *    N belongs to band `ceil(N / LEVELS_PER_BAND)`, clamped to 1..NUM_BANDS.
 *    Lower level numbers ⇒ lower (easier) bands; the easy→hard ordering of the
 *    PRD falls straight out. See `bandForLevelNumber`.
 *
 * 2. VARIATION GROUP. All variations of a single level number share one stable
 *    `variationGroup`, and we use the LEVEL NUMBER ITSELF as that group id. It
 *    is stable across re-runs (deterministic from the level number alone),
 *    unique per level number, and trivially lets the client/admin fetch "all
 *    variations of level N" by `variationGroup = N`.
 *
 * 3. DETERMINISTIC SUB-SEEDS. Each (levelNumber, variationIndex) gets its own
 *    sub-seed derived from the base `seed`, so the whole job is reproducible and
 *    distinct variations explore different layouts. See `subSeedFor`. The mix
 *    uses large odd multipliers to spread inputs across the 32-bit RNG space.
 *
 * 4. IDEMPOTENCY / RE-RUN POLICY (v1: SKIP-WHEN-FULL). bulkGenerate does NOT
 *    content-dedupe. Instead, for each level number it counts EXISTING ACTIVE
 *    variations matching (languageId, script, mode, levelNumber, variationGroup)
 *    and only creates enough NEW variations to reach `variationsPerLevel`. So a
 *    naive re-run with the same inputs creates nothing (idempotent), and growing
 *    `variationsPerLevel` later tops up the missing variations. This deliberately
 *    does NOT retire/replace existing levels — the PRD's "shuffle/regenerate
 *    retires old + creates new" is a SEPARATE admin action, out of scope here.
 *
 *    KNOWN LIMITATION (sub-seed gap on degenerate skips). A top-up run resumes
 *    variation indices from the COUNT of existing active variations
 *    (`variationIndex = existing + i`). The count is gap-unaware: it only knows
 *    HOW MANY variations exist, not WHICH canonical indices succeeded. So if an
 *    earlier run hit a degenerate skip (policy 5) and left a GAP — e.g. index 1
 *    failed while indices 0 and 2 succeeded, leaving count = 2 — a later top-up
 *    starts at index 2, which already succeeded, and re-derives an
 *    already-used sub-seed. The result is a variation whose CONTENT duplicates
 *    an existing one rather than one that fills the exact gap. This is BOUNDED:
 *    top-up never creates more than `variationsPerLevel` active rows total, so it
 *    can never over-create — it can only regenerate already-seen content for the
 *    make-up slot. We accept this for v1 because the count is all we persist;
 *    correct gap-filling would require persisting the per-row variationIndex on
 *    the Level schema (deferred — no migration in this task).
 *
 * 5. DEGENERATE SKIPS. `generateLevel` returns null only for degenerate inputs
 *    (zero words placed across every attempt). We skip those, log them, and
 *    count only successfully created levels. `levelNumbers` in the result lists
 *    every level number that ended up with at least one persisted variation.
 */

import { type PrismaClient } from "@prisma/client";

import {
  LEVELS_PER_BAND,
  NUM_BANDS,
} from "./difficulty.js";
import {
  generateLevel,
  type DictionaryEntry,
} from "./generateLevel.js";
import { type Script } from "./graphemes.js";

/* ──────────────────────────────── Types ────────────────────────────────── */

/**
 * Minimal subset of PrismaClient that bulkGenerate uses. We PICK the real
 * `level` delegate off the generated `PrismaClient` rather than re-declaring its
 * (variant, complex) method signatures structurally — re-declaring them would
 * fight Prisma's input unions (e.g. `gridData`'s JSON input type) and break
 * assignability. Picking keeps the dependency surface tiny and testable while
 * staying exactly compatible with both the runtime and test clients.
 */
export type PrismaClientLike = Pick<PrismaClient, "level">;

export interface BulkGenerateInput {
  /** Injected so tests use the test DB and the CLI wires the runtime client. */
  prisma: PrismaClientLike;
  languageId: string;
  script: Script;
  mode: "basic" | "advanced";
  /** How many distinct level NUMBERS to fill (1..levelCount). */
  levelCount: number;
  /** How many table variations to create per level number. */
  variationsPerLevel: number;
  /** Base seed for full determinism. */
  seed: number;
  /** Candidate words + frequency + clue content. */
  dictionary: DictionaryEntry[];
  /** Optional sink for progress logging (defaults to console.log). */
  logger?: (message: string) => void;
}

export interface BulkGenerateResult {
  created: number;
  levelNumbers: number[];
}

/* ─────────────────────────────── Mapping ───────────────────────────────── */

/**
 * Inverse of `levelNumberRange`: which difficulty band a level number belongs
 * to. Band b owns numbers (b-1)*LEVELS_PER_BAND+1 .. b*LEVELS_PER_BAND, so
 * N ⇒ ceil(N / LEVELS_PER_BAND), clamped to 1..NUM_BANDS. See policy (1).
 */
export function bandForLevelNumber(levelNumber: number): number {
  const n = Math.max(1, Math.floor(levelNumber));
  const band = Math.ceil(n / LEVELS_PER_BAND);
  return Math.min(Math.max(band, 1), NUM_BANDS);
}

/** Stable variation group for a level number. See policy (2). */
export function variationGroupFor(levelNumber: number): number {
  return levelNumber;
}

/**
 * Deterministic sub-seed for one variation. Mixes the base seed, level number
 * and variation index with large odd multipliers, kept in the 32-bit unsigned
 * range so makeRng gets a clean integer. See policy (3).
 */
export function subSeedFor(
  baseSeed: number,
  levelNumber: number,
  variationIndex: number,
): number {
  const mixed =
    Math.imul(baseSeed >>> 0, 1_000_003) +
    Math.imul(levelNumber, 1009) +
    variationIndex * 7919;
  return mixed >>> 0;
}

/* ──────────────────────────────── Job ──────────────────────────────────── */

export async function bulkGenerate(
  input: BulkGenerateInput,
): Promise<BulkGenerateResult> {
  const {
    prisma,
    languageId,
    script,
    mode,
    levelCount,
    variationsPerLevel,
    seed,
    dictionary,
  } = input;
  const log = input.logger ?? ((m: string) => console.log(m));

  let created = 0;
  const levelNumbers: number[] = [];

  for (let levelNumber = 1; levelNumber <= levelCount; levelNumber++) {
    const targetBand = bandForLevelNumber(levelNumber);
    const variationGroup = variationGroupFor(levelNumber);

    // Idempotency (policy 4): only create enough to reach variationsPerLevel.
    const existing = await prisma.level.count({
      where: {
        languageId,
        script,
        mode,
        levelNumber,
        variationGroup,
        status: "active",
      },
    });
    const toCreate = Math.max(0, variationsPerLevel - existing);

    if (toCreate === 0) {
      log(
        `level ${levelNumber} (band ${targetBand}): already has ${existing}/${variationsPerLevel} active variations — skipping`,
      );
      continue;
    }

    let createdForNumber = 0;
    // Offset the variation index by what already exists so re-runs derive fresh
    // sub-seeds for the new variations rather than recomputing existing ones.
    // NOTE: `existing` is a COUNT, not a high-water mark, so this is gap-unaware
    // on the degenerate-skip path — see the KNOWN LIMITATION in policy (4).
    for (let i = 0; i < toCreate; i++) {
      const variationIndex = existing + i;
      const subSeed = subSeedFor(seed, levelNumber, variationIndex);

      const result = generateLevel({
        languageId,
        script,
        mode,
        targetBand,
        seed: subSeed,
        dictionary,
      });

      if (result === null) {
        log(
          `level ${levelNumber} variation ${variationIndex} (band ${targetBand}): degenerate (no words placed) — skipped`,
        );
        continue;
      }

      await prisma.level.create({
        data: {
          mode: result.mode,
          languageId: result.languageId,
          script: result.script,
          difficultyCoefficient: result.difficultyCoefficient,
          difficultyBand: result.difficultyBand,
          levelNumber,
          variationGroup,
          gridWidth: result.gridWidth,
          gridHeight: result.gridHeight,
          gridData: result.gridData,
          status: "active",
        },
      });

      created++;
      createdForNumber++;
    }

    if (createdForNumber > 0) {
      levelNumbers.push(levelNumber);
      log(
        `level ${levelNumber} (target band ${targetBand} of ${NUM_BANDS}, group ${variationGroup}): created ${createdForNumber} variation(s)`,
      );
    }
  }

  log(
    `bulkGenerate done: created ${created} level(s) across ${levelNumbers.length} level number(s)`,
  );
  return { created, levelNumbers };
}
