/**
 * SHARED DICTIONARY LOADER (Task 3.5, extracted from runBulkGenerate.ts).
 *
 * Loads the candidate dictionary for a (languageId, script) from the DB
 * `Dictionary` table, joining each word to ONE of its `Clue` rows to produce a
 * `DictionaryEntry { word, frequency, clue }`. We take the first clue per word
 * (deterministic by clue id); words with no clue still generate but get a
 * placeholder text clue. The full DB dictionary can be passed straight to
 * `generateLevel` — it samples/caps the candidate pool internally.
 *
 * This loader is the SINGLE source of truth shared by BOTH the bulk-generation
 * CLI (src/jobs/runBulkGenerate.ts) and the admin generate/regenerate routes
 * (src/services/admin.ts), so the DB→DictionaryEntry mapping lives in one place.
 */

import { type DictionaryEntry } from "../generator/generateLevel.js";
import { type Clue } from "../generator/gridData.js";
import { type Script } from "../generator/graphemes.js";

import type { PrismaClient } from "@prisma/client";

/** The slice of PrismaClient the loader needs (so tests can inject narrow doubles). */
export type DictionaryLoaderPrisma = Pick<PrismaClient, "dictionary">;

/**
 * Loads the candidate dictionary for (languageId, script) from the DB, joining
 * each word to its first clue (deterministic by clue id).
 */
export async function loadDictionaryForLanguage(
  prisma: DictionaryLoaderPrisma,
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
