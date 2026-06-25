/**
 * ADMIN SERVICES (Task 3.5).
 *
 * The business logic behind the admin-only endpoints, kept out of the route so
 * it is directly unit/integration-testable WITHOUT going through HTTP. HTTP
 * concerns (the admin-key guard, status codes, zod body parsing) live in
 * src/routes/admin.ts; persistence + generation composition live here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ASYNC-GENERATE SPLIT (documented)
 * ─────────────────────────────────────────────────────────────────────────
 * Bulk generation can be slow, so the HTTP route is fire-and-forget: it kicks
 * `runGenerate`/`runRegenerate` off WITHOUT awaiting and returns 202 + a jobId
 * immediately. There is intentionally NO real job queue in v1 — the jobId is an
 * opaque correlation id for logs; we do not (yet) expose job status. These
 * SERVICE functions, by contrast, return a Promise the CALLER can await, which
 * is exactly what the tests use to assert the DB effect deterministically
 * (no flaky background timers). Same code path, two callers (route = unawaited,
 * test = awaited).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGENERATE SEMANTICS (documented)
 * ─────────────────────────────────────────────────────────────────────────
 * `runRegenerate` implements the PRD "shuffle/regenerate" rule: for the given
 * (language, script, mode) scope it FIRST flips every currently-active Level to
 * `status: 'retired'`, THEN runs `bulkGenerate` to create fresh active ones.
 * Retiring (not deleting) is deliberate: existing players' `UserProgress` rows
 * keep their FK to the now-retired level ids and are completely untouched —
 * their history stays valid while NEW players are served the new active set.
 */

import { bulkGenerate, type BulkGenerateResult } from "../generator/bulkGenerate.js";
import { type Script } from "../generator/graphemes.js";
import { loadDictionaryForLanguage } from "../jobs/loadDictionary.js";

import type { PrismaClient } from "@prisma/client";

/* ──────────────────────────── Dictionary insert ─────────────────────────── */

export interface DictionaryClueInput {
  type: "text" | "image";
  text?: string;
  imageRef?: string;
  personalityRef?: string;
}

export interface DictionaryWordInput {
  word: string;
  frequency: number;
  length?: number;
  clue?: DictionaryClueInput;
}

export interface AddDictionaryInput {
  languageId: string;
  script: string;
  words: DictionaryWordInput[];
}

/**
 * Bulk-inserts dictionary words (and their optional clue) for a language.
 *
 * IDEMPOTENCY (skip-if-exists): a word is skipped when a row already exists for
 * the same (languageId, script, word), so re-running the same batch is safe and
 * creates no duplicates. `created` counts only the rows actually inserted.
 *
 * The clue's `Clue.content` is the clue's text (for `type: 'text'`) or its image
 * reference (for `type: 'image'`), matching the loader's read-back mapping in
 * loadDictionaryForLanguage. `length` defaults to the word's character length.
 */
export async function addDictionaryEntries(
  prisma: Pick<PrismaClient, "dictionary">,
  input: AddDictionaryInput,
): Promise<{ created: number }> {
  const { languageId, script, words } = input;
  let created = 0;

  for (const w of words) {
    const existing = await prisma.dictionary.findFirst({
      where: { languageId, script, word: w.word },
      select: { id: true },
    });
    if (existing) continue;

    const clueContent =
      w.clue === undefined
        ? undefined
        : w.clue.type === "image"
          ? (w.clue.imageRef ?? "")
          : (w.clue.text ?? "");

    await prisma.dictionary.create({
      data: {
        languageId,
        word: w.word,
        script,
        frequency: w.frequency,
        length: w.length ?? [...w.word].length,
        ...(w.clue !== undefined && {
          clues: { create: { type: w.clue.type, content: clueContent! } },
        }),
      },
    });
    created++;
  }

  return { created };
}

/* ───────────────────────────────── Generate ─────────────────────────────── */

export interface GenerateInput {
  languageId: string;
  script: Script;
  mode: "basic" | "advanced";
  levelCount: number;
  variationsPerLevel: number;
  seed: number;
}

/**
 * Loads the dictionary for (languageId, script) and runs `bulkGenerate` to
 * create new ACTIVE level variations. Reuses the SAME bulk generator and the
 * SAME shared dictionary loader as the CLI (DRY). Awaitable — the route does not
 * await it; the tests do.
 */
export async function runGenerate(
  prisma: PrismaClient,
  input: GenerateInput,
): Promise<BulkGenerateResult> {
  const dictionary = await loadDictionaryForLanguage(prisma, input.languageId, input.script);
  return bulkGenerate({
    prisma,
    languageId: input.languageId,
    script: input.script,
    mode: input.mode,
    levelCount: input.levelCount,
    variationsPerLevel: input.variationsPerLevel,
    seed: input.seed,
    dictionary,
  });
}

/* ──────────────────────────────── Regenerate ────────────────────────────── */

export interface RegenerateResult {
  retired: number;
  created: number;
  levelNumbers: number[];
}

/**
 * Retires the active levels for the (language, script, mode) scope, then runs
 * `bulkGenerate` to create fresh active ones. See REGENERATE SEMANTICS above:
 * UserProgress is left intact (it FKs the now-retired ids).
 */
export async function runRegenerate(
  prisma: PrismaClient,
  input: GenerateInput,
): Promise<RegenerateResult> {
  const { count: retired } = await prisma.level.updateMany({
    where: {
      languageId: input.languageId,
      script: input.script,
      mode: input.mode,
      status: "active",
    },
    data: { status: "retired" },
  });

  const { created, levelNumbers } = await runGenerate(prisma, input);
  return { retired, created, levelNumbers };
}
