/**
 * CLI ENTRY for the bulk level-generation job (Task 2.8).
 *
 * Thin wrapper around the testable core (`bulkGenerate`): it parses argv, wires
 * the RUNTIME Prisma client (src/db/client.ts), loads the candidate dictionary
 * from the DB for the requested language/script, runs the job and logs progress.
 * A main guard keeps `import`ing this module side-effect free.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DICTIONARY LOADING (documented choice)
 * ─────────────────────────────────────────────────────────────────────────
 * The CLI loads candidate words from the DB `Dictionary` table (filtered to the
 * language + script) and joins each to ONE of its `Clue` rows to produce a
 * `DictionaryEntry { word, frequency, clue }`. We take the first clue per word
 * (deterministic by clue id); words with no clue still generate but get the
 * pipeline's placeholder clue. Per Task 2.4's scaling note, the full DB
 * dictionary can be passed straight through — `generateLevel` samples/caps the
 * candidate pool internally, so a large corpus is fine here.
 *
 * Usage:
 *   tsx src/jobs/runBulkGenerate.ts \
 *     --language sr --script lat --mode basic \
 *     --levelCount 20 --variationsPerLevel 3 --seed 12345
 *
 * `--language` accepts either a Language id (cuid) or a language code (e.g. sr);
 * codes are resolved to ids. Defaults: script lat, mode basic, levelCount 10,
 * variationsPerLevel 3, seed 12345.
 */

import { fileURLToPath } from "node:url";

import { prisma } from "../db/client.js";
import {
  bulkGenerate,
  type BulkGenerateResult,
} from "../generator/bulkGenerate.js";
import { type DictionaryEntry } from "../generator/generateLevel.js";
import { type Clue } from "../generator/gridData.js";
import { type Script } from "../generator/graphemes.js";

interface CliArgs {
  language: string;
  script: Script;
  mode: "basic" | "advanced";
  levelCount: number;
  variationsPerLevel: number;
  seed: number;
}

/** Minimal `--flag value` parser over process.argv (no heavy CLI lib). */
function parseArgs(argv: string[]): CliArgs {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        raw[key] = next;
        i++;
      } else {
        raw[key] = "true";
      }
    }
  }

  const script = (raw.script ?? "lat") as Script;
  if (script !== "lat" && script !== "cyr") {
    throw new Error(`--script must be 'lat' or 'cyr', got '${script}'`);
  }
  const mode = (raw.mode ?? "basic") as "basic" | "advanced";
  if (mode !== "basic" && mode !== "advanced") {
    throw new Error(`--mode must be 'basic' or 'advanced', got '${mode}'`);
  }

  const language = raw.language ?? raw.languageId;
  if (!language) {
    throw new Error("--language (id or code) is required");
  }

  return {
    language,
    script,
    mode,
    levelCount: toPositiveInt(raw.levelCount, "levelCount", 10),
    variationsPerLevel: toPositiveInt(raw.variationsPerLevel, "variationsPerLevel", 3),
    seed: toInt(raw.seed, "seed", 12345),
  };
}

function toInt(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`--${name} must be an integer, got '${value}'`);
  return n;
}

function toPositiveInt(value: string | undefined, name: string, fallback: number): number {
  const n = toInt(value, name, fallback);
  if (n <= 0) throw new Error(`--${name} must be a positive integer, got '${value}'`);
  return n;
}

/**
 * Resolves a Language id from either a cuid id or a language code, returning
 * the id used as the levels FK.
 */
async function resolveLanguageId(idOrCode: string): Promise<string> {
  const byId = await prisma.language.findUnique({ where: { id: idOrCode } });
  if (byId) return byId.id;
  const byCode = await prisma.language.findUnique({ where: { code: idOrCode } });
  if (byCode) return byCode.id;
  throw new Error(`No Language found for id-or-code '${idOrCode}'`);
}

/**
 * Loads the candidate dictionary for (languageId, script) from the DB, joining
 * each word to its first clue. See the DICTIONARY LOADING note above.
 */
async function loadDictionary(
  languageId: string,
  script: Script,
): Promise<DictionaryEntry[]> {
  const words = await prisma.dictionary.findMany({
    where: { languageId, script },
    include: { clues: { orderBy: { id: "asc" }, take: 1 } },
    orderBy: { id: "asc" },
  });

  return words.map((w): DictionaryEntry => {
    const dbClue = w.clues[0];
    const clue: Clue = dbClue
      ? dbClue.type === "image"
        ? { type: "image", imageRef: dbClue.content }
        : { type: "text", text: dbClue.content }
      : { type: "text", text: "" };
    return { word: w.word, frequency: w.frequency, clue };
  });
}

async function main(): Promise<BulkGenerateResult> {
  const args = parseArgs(process.argv.slice(2));
  const languageId = await resolveLanguageId(args.language);
  const dictionary = await loadDictionary(languageId, args.script);

  console.log(
    `[bulkGenerate] language=${args.language} (${languageId}) script=${args.script} mode=${args.mode} ` +
      `levelCount=${args.levelCount} variationsPerLevel=${args.variationsPerLevel} seed=${args.seed} ` +
      `dictionaryWords=${dictionary.length}`,
  );

  if (dictionary.length === 0) {
    console.warn(
      "[bulkGenerate] WARNING: empty dictionary for this language/script; nothing will be generated.",
    );
  }

  const result = await bulkGenerate({
    prisma,
    languageId,
    script: args.script,
    mode: args.mode,
    levelCount: args.levelCount,
    variationsPerLevel: args.variationsPerLevel,
    seed: args.seed,
    dictionary,
    logger: (m) => console.log(`[bulkGenerate] ${m}`),
  });

  console.log(
    `[bulkGenerate] FINISHED: created=${result.created} levelNumbers=[${result.levelNumbers.join(", ")}]`,
  );
  return result;
}

// Main guard: only run when executed directly, not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then(() => prisma.$disconnect())
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error("[bulkGenerate] FAILED:", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
