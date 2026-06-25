# Ukrštene Reči — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Ukrštene Reči crossword game (iOS + Android) — Expo client + Node.js/PostgreSQL backend with a server-side bulk level generator — from an empty repo to a shippable v1.

**Architecture:** Monorepo with two packages: `backend/` (Node.js + TypeScript + Fastify + Prisma + PostgreSQL) and `mobile/` (Expo + TypeScript + Expo Router + Zustand + SQLite). Backend bulk-generates skandinavka crossword levels from dictionaries and serves unplayed levels per language/script/mode; the client caches level packs locally and plays offline, syncing progress when online. The level generator is pure, heavily unit-tested TypeScript — the highest-risk component, built first as a spike.

**Tech Stack:** Backend: Node 20, TypeScript, Fastify, Prisma, PostgreSQL, Vitest, supertest, Zod. Mobile: Expo SDK 52+, TypeScript, Expo Router, Zustand, expo-sqlite, react-native-reanimated, react-native-gesture-handler, i18next, Jest + React Native Testing Library.

**Reference:** Design/PRD in `docs/plans/2026-06-25-ukrstene-reci-design.md`. Read it before starting.

**Conventions for all tasks:** DRY, YAGNI, TDD (red → green → commit), frequent small commits. Prose decisions here; pin exact code as you implement. Every commit message ends with the project's Co-Authored-By trailer.

---

## Phase 0 — Repo & tooling scaffolding

### Task 0.1: Monorepo skeleton

**Files:**
- Create: `package.json` (root, workspaces), `backend/package.json`, `mobile/package.json`
- Create: `README.md`, `.editorconfig`, `.nvmrc` (`20`)
- Modify: `.gitignore` (already present — confirm covers `backend/dist`, `mobile/.expo`)

**Steps:**
1. Root `package.json` with npm workspaces: `"workspaces": ["backend", "mobile"]`, `"private": true`.
2. `README.md` documenting: layout, how to run backend (`npm -w backend run dev`), how to run mobile (`npm -w mobile run start`), link to PRD.
3. Commit: `chore: monorepo skeleton with npm workspaces`.

### Task 0.2: Backend TypeScript + tooling baseline

**Files:**
- Create: `backend/tsconfig.json`, `backend/vitest.config.ts`, `backend/.eslintrc.cjs`, `backend/src/index.ts` (placeholder)
- Create: `backend/src/health.test.ts`

**Steps:**
1. Install: `typescript`, `tsx`, `vitest`, `eslint`, `@typescript-eslint/*`, `zod`.
2. **Write failing test** `backend/src/health.test.ts`: `expect(add(2,3)).toBe(5)` importing a not-yet-existing `add` from `src/util/math.ts`.
3. Run `npm -w backend test` → expect FAIL (module not found).
4. Create `src/util/math.ts` with `export const add = (a:number,b:number)=>a+b`.
5. Run test → PASS. (This proves the test harness works; delete later.)
6. Commit: `chore: backend TS + vitest baseline`.

### Task 0.3: Mobile Expo + TypeScript baseline

**Files:**
- Create via `npx create-expo-app@latest mobile --template` (TypeScript, tabs or blank)
- Create: `mobile/jest.config.js`, `mobile/__tests__/smoke.test.ts`

**Steps:**
1. Scaffold Expo app into `mobile/` (Expo Router, TS).
2. Add Jest + React Native Testing Library + `jest-expo` preset.
3. Smoke test: a pure function returns expected value; run `npm -w mobile test` → PASS.
4. Verify `npm -w mobile run start` boots Expo dev server (manual check).
5. Commit: `chore: mobile Expo + TS + jest baseline`.

---

## Phase 1 — Backend data layer (Prisma + PostgreSQL schema)

### Task 1.1: Prisma init against existing VPS database, new schema

**Files:**
- Create: `backend/prisma/schema.prisma`, `backend/.env.example`
- Create: `backend/src/db/client.ts`

**Steps:**
1. Install `prisma`, `@prisma/client`.
2. `schema.prisma` datasource uses `DATABASE_URL` with `?schema=ukrstene` (Postgres multi-schema; isolates from existing app's tables).
3. `.env.example` documents `DATABASE_URL` (no real secrets committed).
4. `src/db/client.ts` exports a singleton `PrismaClient`.
5. Commit: `feat(backend): prisma init with isolated 'ukrstene' schema`.

### Task 1.2: Schema models (from PRD §3)

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev --name init`

**Steps:**
1. Define models exactly per PRD §3: `Language`, `Dictionary`, `Clue`, `Personality`, `Level`, `User`, `UserProgress`. Key fields:
   - `Language`: `code` (sr/hr/bs/me/mk) unique, `supportedScripts` String[].
   - `Dictionary`: `languageId`, `word`, `script`, `frequency` Float, `length` Int. Index on `(languageId, script, length)`.
   - `Level`: `mode` enum(`basic`,`advanced`), `languageId`, `script`, `difficultyCoefficient` Int, `difficultyBand` Int, `levelNumber` Int, `variationGroup` Int, `gridWidth` Int, `gridHeight` Int, `gridData` Json, `status` enum(`active`,`retired`). Index on `(languageId, script, mode, levelNumber, status)`.
   - `UserProgress`: `(userId, levelId, mode)` unique; `stars`, `score`, `mistakes`, `hintsUsed`, `completedAt`.
2. Run `npx prisma migrate dev` → migration applied to `ukrstene` schema.
3. **Verification:** `npx prisma studio` shows empty tables (manual), or write a Vitest integration test (against a test DB) that connects and counts `language` rows = 0.
4. Commit: `feat(backend): core data model + initial migration`.

### Task 1.3: Seed languages

**Files:**
- Create: `backend/prisma/seed.ts`
- Create: `backend/src/db/seed.test.ts`

**Steps:**
1. **Write failing test:** after running seed, `prisma.language.count()` === 5 and `sr` has `supportedScripts == ['cyr','lat']`, `mk == ['cyr']`, others `['lat']`.
2. Run → FAIL.
3. Implement `seed.ts` inserting the 5 languages with correct scripts (idempotent upsert by `code`).
4. Run test → PASS.
5. Commit: `feat(backend): seed 5 languages with scripts`.

---

## Phase 2 — Level generator (HIGH RISK — build & test first)

> This is the technical core. Build it as pure functions in `backend/src/generator/`, fully unit-tested, independent of HTTP/DB. Decisions in PRD §4. Recommend a focused spike before wiring to the API.

### Task 2.1: Grapheme model (digraphs as single cells)

**Files:**
- Create: `backend/src/generator/graphemes.ts`
- Create: `backend/src/generator/graphemes.test.ts`

**Steps:**
1. **Write failing tests:**
   - `splitGraphemes('NJEGOŠ','lat','sr')` → `['NJ','E','G','O','Š']` (Nj is one cell).
   - `splitGraphemes('ЉУБАВ','cyr','mk')` → `['Љ','У','Б','А','В']`.
   - Handles `LJ`, `NJ`, `DŽ` (lat) and `Љ`,`Њ`,`Џ` (cyr); Montenegrin `Ś`,`Ź`.
2. Run → FAIL.
3. Implement `splitGraphemes(word, script, langCode)`: greedy match against per-script digraph table; uppercases; returns grapheme array. Also export `graphemeLength(word,...)`.
4. Run → PASS.
5. Commit: `feat(generator): grapheme splitting with digraph support`.

### Task 2.2: Cyrillic↔Latin transliteration (Serbian)

**Files:**
- Create: `backend/src/generator/translit.ts`
- Create: `backend/src/generator/translit.test.ts`

**Steps:**
1. **Write failing tests:** `latToCyr('LJUBAV')==='ЉУБАВ'`, `cyrToLat('ЊЕГОШ')==='NJEGOŠ'`, round-trip stable.
2. Run → FAIL.
3. Implement deterministic mapping tables (handle digraphs Lj/Nj/Dž ↔ Љ/Њ/Џ).
4. Run → PASS.
5. Commit: `feat(generator): Serbian cyr<->lat transliteration`.

### Task 2.3: Grid representation & word placement primitives

**Files:**
- Create: `backend/src/generator/grid.ts`
- Create: `backend/src/generator/grid.test.ts`

**Steps:**
1. **Write failing tests:**
   - `canPlace(grid, word, row, col, 'across')` returns false if out of bounds or conflicts with existing letters; true if empty or matching at intersections.
   - `placeWord(...)` mutates a copy, recording occupied cells and the word's cell range.
   - Intersecting words share a cell only when graphemes match.
2. Run → FAIL.
3. Implement `Grid` type (width, height, cells: grapheme|null + ownership metadata) and `canPlace`/`placeWord` with across/down directions.
4. Run → PASS.
5. Commit: `feat(generator): grid + word placement primitives`.

### Task 2.4: Crossword layout builder (skandinavka)

**Files:**
- Create: `backend/src/generator/layout.ts`
- Create: `backend/src/generator/layout.test.ts`

**Steps:**
1. **Write failing tests** with a tiny fixed dictionary:
   - `buildLayout({width:6,height:6, words, rng})` returns a layout where every placed word intersects at least one other (connected), no isolated words, within bounds.
   - Determinism: same seed → same layout (inject seeded RNG, no `Math.random`).
   - Clue cells (the arrow/association squares) are assigned at each word's start with a direction.
2. Run → FAIL.
3. Implement greedy crossword packing: seed first word, then repeatedly pick a dictionary word that intersects an existing letter, maximizing crossings; assign clue cells + arrow directions. Accept a seeded RNG param.
4. Run → PASS (iterate until layouts look valid; add more assertions as needed).
5. Commit: `feat(generator): skandinavka layout builder`.

### Task 2.5: Difficulty coefficient

**Files:**
- Create: `backend/src/generator/difficulty.ts`
- Create: `backend/src/generator/difficulty.test.ts`

**Steps:**
1. **Write failing tests:**
   - `difficultyOf(layout, dict)` returns 1–100.
   - Monotonic checks: larger grid > smaller; more rare words (low `frequency`) > common; more crossings → adjusts as defined.
   - `bandOf(coefficient)` buckets into bands (e.g. 20 bands), and `levelNumberRange(band)` maps a band to a level-number range.
2. Run → FAIL.
3. Implement weighted formula over: grid size, summed word length, rarity (inverse frequency), crossing count, (advanced) letter-confusability. Document weights as named constants.
4. Run → PASS.
5. Commit: `feat(generator): difficulty coefficient + bands`.

### Task 2.6: gridData serialization (shared client/server contract)

**Files:**
- Create: `backend/src/generator/gridData.ts` (+ Zod schema `GridDataSchema`)
- Create: `backend/src/generator/gridData.test.ts`
- Create: `shared/gridData.types.ts` (types imported by both backend and mobile)

**Steps:**
1. **Write failing test:** `serializeGridData(layout)` produces JSON validating against `GridDataSchema` and containing: dimensions, cells (letter cells vs clue cells with text/image/personality + arrow direction), words (cells, answer, direction), solution. Round-trips via `parse`.
2. Run → FAIL.
3. Implement serializer + Zod schema. This JSON is the contract both modes and the client render from (PRD §3 " key rule").
4. Run → PASS.
5. Commit: `feat(generator): gridData serialization + shared schema`.

### Task 2.7: End-to-end generator (single level)

**Files:**
- Create: `backend/src/generator/generateLevel.ts`
- Create: `backend/src/generator/generateLevel.test.ts`

**Steps:**
1. **Write failing test:** `generateLevel({languageId, script, mode, targetBand, seed, dictionary})` returns a `Level`-shaped object: valid `gridData`, `difficultyCoefficient` within the target band's range, `gridWidth/Height` within PRD limits (w 6–9, h 6–12), connected layout.
2. Run → FAIL.
3. Compose Tasks 2.1–2.6: pick words for target band, build layout, compute difficulty, retry until coefficient lands in band (bounded attempts), serialize.
4. Run → PASS.
5. Commit: `feat(generator): single-level generation pipeline`.

### Task 2.8: Bulk generator job

**Files:**
- Create: `backend/src/generator/bulkGenerate.ts`
- Create: `backend/src/generator/bulkGenerate.test.ts`
- Create: `backend/src/jobs/runBulkGenerate.ts` (CLI entry, background-runnable)

**Steps:**
1. **Write failing test:** `bulkGenerate({languageId, script, mode, levelCount, variationsPerLevel, seed})` returns N×variations levels; multiple variations share a `variationGroup` and similar band; spans the difficulty range from easy→hard across `levelNumber`.
2. Run → FAIL.
3. Implement: loop bands easy→hard, generate `variationsPerLevel` per level number, assign `levelNumber`/`variationGroup`, persist via Prisma (`status:'active'`). Make it resumable/idempotent enough to re-run when new words are added.
4. Run → PASS.
5. CLI `runBulkGenerate.ts` parses args and runs as a background job (logs progress).
6. Commit: `feat(generator): bulk generation job + CLI`.

---

## Phase 3 — Backend API

### Task 3.1: Fastify app + health route

**Files:**
- Create: `backend/src/app.ts`, `backend/src/server.ts`
- Create: `backend/src/routes/health.test.ts`

**Steps:**
1. Install `fastify`, `@fastify/jwt`, `supertest` (or fastify `inject`).
2. **Write failing test:** `GET /v1/health` → 200 `{status:'ok'}` (use `app.inject`).
3. Run → FAIL.
4. Implement `app.ts` (builds Fastify instance, registers routes) + health route. `server.ts` listens.
5. Run → PASS.
6. Commit: `feat(api): fastify app + health route`.

### Task 3.2: Auth (anonymous + Apple/Google)

**Files:**
- Create: `backend/src/routes/auth.ts`, `backend/src/services/auth.ts`
- Create: `backend/src/routes/auth.test.ts`

**Steps:**
1. **Write failing tests:**
   - `POST /v1/auth/anon` with device id → 200, returns JWT + creates `User(authProvider:'anon')`.
   - `POST /v1/auth/social` with a (mocked) verified Apple/Google token → returns JWT; if an anon user id is supplied, migrates its progress to the social account.
2. Run → FAIL.
3. Implement anon auth first; stub social token verification behind an interface (`verifyAppleToken`/`verifyGoogleToken`) so tests mock it; implement progress migration.
4. Run → PASS.
5. Commit: `feat(api): anonymous + social auth with progress migration`.

### Task 3.3: Serve next unplayed level pack

**Files:**
- Create: `backend/src/routes/levels.ts`, `backend/src/services/levels.ts`
- Create: `backend/src/routes/levels.test.ts`

**Steps:**
1. **Write failing tests (integration, seeded levels + a user):**
   - `GET /v1/levels/next?mode=basic&lang=sr&script=lat&count=10` → returns up to 10 `active` levels the user has NOT completed, ordered by `levelNumber`, one variation per level number.
   - Excludes `retired` levels not already in progress.
   - Respects per-language progression.
2. Run → FAIL.
3. Implement query joining `Level` ⟕ `UserProgress`, filtering completed, picking one variation per level number (stable per user — e.g. hash(userId+levelNumber)).
4. Run → PASS.
5. Commit: `feat(api): serve next unplayed level pack`.

### Task 3.4: Submit progress / sync

**Files:**
- Create: `backend/src/routes/progress.ts`, `backend/src/services/progress.ts`
- Create: `backend/src/routes/progress.test.ts`

**Steps:**
1. **Write failing tests:**
   - `POST /v1/progress` (auth) with `{levelId, mode, stars, score, mistakes, hintsUsed}` upserts `UserProgress`; idempotent on resend (offline sync may retry).
   - `POST /v1/progress/batch` accepts an array (client flushes queued offline results).
   - Server never re-serves a completed level afterward (ties to 3.3).
2. Run → FAIL.
3. Implement upsert on `(userId, levelId, mode)`; batch endpoint loops.
4. Run → PASS.
5. Commit: `feat(api): progress submission + batch sync`.

### Task 3.5: Admin endpoints (minimal, protected)

**Files:**
- Create: `backend/src/routes/admin.ts`
- Create: `backend/src/routes/admin.test.ts`

**Steps:**
1. **Write failing tests (admin-token guarded):**
   - `POST /v1/admin/dictionary` adds words (bulk).
   - `POST /v1/admin/generate` enqueues a bulk-generate job for given params.
   - `POST /v1/admin/regenerate` creates new variations and sets prior ones `status:'retired'`.
   - Non-admin token → 403.
2. Run → FAIL.
3. Implement with a simple admin API key guard (env). Job kicked off async; return job id.
4. Run → PASS.
5. Commit: `feat(api): admin dictionary + generation endpoints`.

> Admin web panel UI is a separate later milestone (Phase 11) — these endpoints are enough to drive generation via curl/Postman for now.

---

## Phase 4 — Mobile foundation

### Task 4.1: Theming (light "Topla enigmatika" + dark)

**Files:**
- Create: `mobile/src/theme/colors.ts`, `mobile/src/theme/ThemeProvider.tsx`
- Create: `mobile/src/theme/colors.test.ts`

**Steps:**
1. **Write failing test:** light/dark palettes export the exact PRD §10 hex values; `useTheme()` returns light by default and switches.
2. Run → FAIL.
3. Implement palettes (light + dark per PRD §10) + provider reading user pref / system. Load Nunito (or Poppins) via `expo-font` with Cyrillic+Latin subsets.
4. Run → PASS.
5. Commit: `feat(mobile): theming + fonts`.

### Task 4.2: i18n (5 languages, UI strings)

**Files:**
- Create: `mobile/src/i18n/index.ts`, `mobile/src/i18n/locales/{sr,hr,bs,me,mk}.json`
- Create: `mobile/src/i18n/i18n.test.ts`

**Steps:**
1. **Write failing test:** `t('play')` returns the correct localized string per active language; falls back gracefully.
2. Run → FAIL.
3. Configure `i18next` + `expo-localization`; seed key UI strings in all 5 locales (start with a small set, expand as screens land).
4. Run → PASS.
5. Commit: `feat(mobile): i18n for 5 languages`.

### Task 4.3: Local DB (SQLite) + repositories

**Files:**
- Create: `mobile/src/db/sqlite.ts`, `mobile/src/db/levelRepo.ts`, `mobile/src/db/progressRepo.ts`
- Create: `mobile/src/db/levelRepo.test.ts`

**Steps:**
1. **Write failing tests** (mock expo-sqlite or use in-memory): cache a level pack; `getNextLevel(mode,lang,script)` returns lowest uncompleted; save progress locally; list unsynced progress.
2. Run → FAIL.
3. Implement schema (mirrors server: cached levels, local progress with `synced` flag) + repos.
4. Run → PASS.
5. Commit: `feat(mobile): SQLite cache + repositories`.

### Task 4.4: API client + sync service

**Files:**
- Create: `mobile/src/api/client.ts`, `mobile/src/services/sync.ts`
- Create: `mobile/src/services/sync.test.ts`

**Steps:**
1. **Write failing tests** (mock fetch): on connectivity, `sync()` flushes unsynced progress via `/v1/progress/batch` and prefetches next pack via `/v1/levels/next` when cache low.
2. Run → FAIL.
3. Implement typed API client (JWT header) + sync service (offline-first: queue writes, reconcile on connect).
4. Run → PASS.
5. Commit: `feat(mobile): API client + offline sync`.

### Task 4.5: Navigation skeleton (Expo Router)

**Files:**
- Create: `mobile/app/_layout.tsx`, `mobile/app/index.tsx` (home), `mobile/app/onboarding.tsx`, `mobile/app/game/[mode].tsx`, `mobile/app/settings.tsx`

**Steps:**
1. Wire routes per PRD §11: onboarding → home → game(mode) → results; settings.
2. Gate onboarding on first launch (no language chosen yet).
3. Manual verification: navigate between placeholder screens.
4. Commit: `feat(mobile): navigation skeleton`.

---

## Phase 5 — Grid rendering & Basic mode

### Task 5.1: Pure game-state engine (shared logic)

**Files:**
- Create: `mobile/src/game/engine.ts` (consumes `shared/gridData.types.ts`)
- Create: `mobile/src/game/engine.test.ts`

**Steps:**
1. **Write failing tests** (pure, no UI):
   - `createGameState(gridData)` builds empty fillable cells, active-word tracking.
   - `setLetter(state, cellId, grapheme)` updates, shared cells reflect in both words.
   - `checkCell` / `isSolved` correct.
   - Mistake counting per PRD §5/§7.
2. Run → FAIL.
3. Implement engine as pure reducers (drives both modes; Advanced adds the letter-palette layer on top).
4. Run → PASS.
5. Commit: `feat(game): pure game-state engine`.

### Task 5.2: Grid renderer component

**Files:**
- Create: `mobile/src/components/Grid.tsx`, `mobile/src/components/Cell.tsx`, `mobile/src/components/ClueCell.tsx`
- Create: `mobile/src/components/Grid.test.tsx`

**Steps:**
1. **Write failing test (RNTL):** given a small `gridData`, renders correct number of letter cells and clue cells; clue cells show text or image + arrow direction; whole grid fits container (auto-size cells to width 6–9 without scroll, per PRD §4.3).
2. Run → FAIL.
3. Implement responsive grid (compute cell size from screen width and `gridWidth`), `Cell`, `ClueCell` (text/image + arrow), active-word highlight.
4. Run → PASS.
5. Commit: `feat(mobile): grid + cell + clue rendering`.

### Task 5.3: In-game keyboard (per language/script)

**Files:**
- Create: `mobile/src/components/Keyboard.tsx`
- Create: `mobile/src/components/Keyboard.test.tsx`

**Steps:**
1. **Write failing test:** keyboard for `sr/lat` includes Š Đ Č Ć Ž and single keys for Lj/Nj/Dž; `me/lat` adds Ś Ź; `mk/cyr` shows Cyrillic incl. Љ Њ Џ; key press emits the grapheme.
2. Run → FAIL.
3. Implement per-script layouts; digraphs as one key.
4. Run → PASS.
5. Commit: `feat(mobile): localized in-game keyboard`.

### Task 5.4: Basic mode screen (wire it together)

**Files:**
- Create: `mobile/src/screens/BasicGame.tsx`; used by `app/game/[mode].tsx`
- Create: `mobile/src/screens/BasicGame.test.tsx`

**Steps:**
1. **Write failing test:** tapping a word, typing via keyboard fills cells; auto-check marks wrong letters red and counts a mistake (default mode); solving all cells triggers results.
2. Run → FAIL.
3. Compose engine + Grid + Keyboard; implement auto-check vs no-check setting; direction toggle on intersections.
4. Run → PASS.
5. Commit: `feat(game): Basic mode playable`.

---

## Phase 6 — Advanced mode

### Task 6.1: Letter-palette engine

**Files:**
- Create: `mobile/src/game/advanced.ts`
- Create: `mobile/src/game/advanced.test.ts`

**Steps:**
1. **Write failing tests:**
   - `nextLetters(state)` yields up to 5 graphemes drawn from still-empty correct cells (v1: only real letters, no decoys — PRD §6.3).
   - On `submit`: correct placements lock; wrong placements removed + counted as mistakes; palette refills to 5 with NEW letters (wrong ones not returned).
   - Loop terminates when grid solved.
2. Run → FAIL.
3. Implement on top of the Phase 5 engine.
4. Run → PASS.
5. Commit: `feat(game): advanced letter-palette engine`.

### Task 6.2: Letter palette UI + drag/drop

**Files:**
- Create: `mobile/src/components/LetterPalette.tsx`, `mobile/src/components/LetterTile.tsx`
- Create: `mobile/src/components/LetterPalette.test.tsx`

**Steps:**
1. **Write failing test:** renders 5 tiles; a tile can be placed into a cell and moved before submit (gesture-handler); placed tiles reflect in state.
2. Run → FAIL.
3. Implement with `react-native-gesture-handler` + `reanimated`; tiles styled amber per PRD §10.
4. Run → PASS.
5. Commit: `feat(mobile): letter palette with drag/drop`.

### Task 6.3: Advanced mode screen + submit animations

**Files:**
- Create: `mobile/src/screens/AdvancedGame.tsx`
- Create: `mobile/src/screens/AdvancedGame.test.tsx`

**Steps:**
1. **Write failing test:** full iteration loop works (place 5 → submit → correct lock / wrong shake → refill) until solved → results.
2. Run → FAIL.
3. Compose advanced engine + palette + grid; add PRD §6.4 animations: correct = scale-bounce + green flash + lock; wrong = shake + red flash + remove; staggered submit check; new tiles slide in; haptics via `expo-haptics`.
4. Run → PASS (logic; visually verify animations manually on device).
5. Commit: `feat(game): Advanced mode playable with animations`.

---

## Phase 7 — Scoring, stars, hints

### Task 7.1: Scoring & stars

**Files:**
- Create: `mobile/src/game/scoring.ts`
- Create: `mobile/src/game/scoring.test.ts`

**Steps:**
1. **Write failing tests:** `scoreLevel({mistakes, hintsUsed, difficultyBand})` → 1–5 stars per PRD §7.1; harder bands forgive more mistakes; 0 mistakes + 0 hints = 5★.
2. Run → FAIL.
3. Implement formula with documented thresholds keyed by band (tunable constants).
4. Run → PASS.
5. Commit: `feat(game): scoring + stars`.

### Task 7.2: Hints (2 per level)

**Files:**
- Create: `mobile/src/game/hints.ts`
- Create: `mobile/src/game/hints.test.ts`

**Steps:**
1. **Write failing tests:** word hint reveals/locks the active word; letter hint reveals/locks current cell; each usable once per level; using a hint flags it for scoring; isolated behind a `HintProvider` interface (so v1 free-per-level can later swap to inventory+ads — PRD §7.2).
2. Run → FAIL.
3. Implement.
4. Run → PASS.
5. Commit: `feat(game): hint system (word + letter)`.

### Task 7.3: Results screen

**Files:**
- Create: `mobile/src/screens/Results.tsx`
- Create: `mobile/src/screens/Results.test.tsx`

**Steps:**
1. **Write failing test:** shows stars (filled per score), score, mistakes, hints used, "Next level" → advances progression; persists progress locally + queues sync.
2. Run → FAIL.
3. Implement with staggered star-fill animation (PRD §6.4).
4. Run → PASS.
5. Commit: `feat(game): results screen + progress persistence`.

---

## Phase 8 — Onboarding, settings, accounts

### Task 8.1: Onboarding / language & country selection

**Files:** `mobile/src/screens/Onboarding.tsx` (+ test)

**Steps:**
1. Test: first launch shows country/language picker; selection persists and becomes default; Serbian shows a cyr/lat choice.
2. Implement; route to home after.
3. Commit: `feat(mobile): onboarding language selection`.

### Task 8.2: Settings

**Files:** `mobile/src/screens/Settings.tsx` (+ test)

**Steps:**
1. Test: change language (→ resets progression to level 1 for new language per PRD §8), script (Serbian), theme, check-mode (auto/none), sound/haptics, login/logout.
2. Implement.
3. Commit: `feat(mobile): settings screen`.

### Task 8.3: Account linking (Apple/Google)

**Files:** `mobile/src/services/account.ts` (+ test)

**Steps:**
1. Test (mocked native sign-in): login links anon progress to social account via `/v1/auth/social`; logout returns to anon.
2. Implement with `expo-apple-authentication` + Google sign-in.
3. Commit: `feat(mobile): optional Apple/Google login`.

---

## Phase 9 — Offline cache, prefetch & polish

### Task 9.1: Pack prefetch & offline guarantees

**Steps:**
1. Test: when cached uncompleted levels < threshold and online, prefetch next pack; gameplay fully works with airplane mode on (cached levels).
2. Implement buffering policy (tune pack size).
3. Commit: `feat(mobile): level pack prefetch + offline buffer`.

### Task 9.2: Image caching for clue images

**Steps:**
1. Use `expo-image` disk cache; clue images load from Cloudflare CDN URL; verify each image fetched once per device (manual).
2. Commit: `feat(mobile): cached clue images`.

### Task 9.3: Advanced-mode tutorial (first level)

**Steps:**
1. Short interactive overlay teaching the 5-letter placement loop (PRD §13 open item).
2. Commit: `feat(mobile): advanced mode tutorial`.

---

## Phase 10 — Hardening & release prep

### Task 10.1: End-to-end smoke (backend)
- Integration test: seed languages → bulk-generate small set → auth anon → fetch pack → submit progress → next pack excludes completed. Commit.

### Task 10.2: Accessibility & device matrix
- Contrast checks, finger-size cells on small devices, font scaling. Manual + snapshot tests. Commit.

### Task 10.3: Build configs & store metadata
- EAS build profiles (iOS/Android), app icons, splash, bundle IDs, privacy strings (anon id usage). Commit.

### Task 10.4: Backend deploy to VPS
- Migration run against production `ukrstene` schema; process manager (pm2/systemd); Cloudflare CDN in front of image dir; admin API key set. Document in README. Commit.

---

## Phase 11 — Admin web panel (post-MVP, separate package `admin/`)

> Not required to ship gameplay (Phase 3.5 endpoints drive generation via API). Build when content workflow needs a UI: dictionary management, personality + image upload, trigger/monitor bulk generation, view stats. Plan in detail when reached.

---

## Suggested execution order & risk notes

1. **Phases 0 → 1 → 2** first. Phase 2 (generator) is the make-or-break spike — if grid packing for these languages proves hard, surface it early.
2. Phases 3–4 in parallel-ish (different surfaces).
3. Phase 5 before 6 (Advanced builds on Basic engine).
4. Defer Phase 11 until content team needs the UI.

**Biggest risks:** (a) crossword layout quality/connectivity for Balkan dictionaries (Task 2.4); (b) fitting grids on-screen without scroll across device sizes (Task 5.2); (c) social-auth + progress migration edge cases (Task 3.2). Write extra tests around these.
