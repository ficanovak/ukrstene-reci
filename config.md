# Config & Local Setup — Ukrštene Reči

> Praktičan vodič: kako pristupiti lokalnim resursima i pokrenuti sve delove projekta.
> **Ovaj dokument se dopunjava u svakoj iteraciji kad nešto promenimo.**
>
> Poslednje ažuriranje: 2026-06-25 (posle Task 1.1)

---

## Pregled okruženja

| Resurs | Vrednost |
|---|---|
| Repo root | `/Users/filipnovakovic/Desktop/ukrstene-reci` |
| Node | pinned `20` (`.nvmrc`); lokalno instaliran v25.x radi |
| Monorepo | npm workspaces: `backend/`, `mobile/` |
| Backend stack | TypeScript (NodeNext, strict) + Vitest + ESLint; Prisma 7 + PostgreSQL; Fastify (kasnije) |
| Mobile stack | Expo + TypeScript (još nije scaffold-ovan — Task 0.3) |

---

## PostgreSQL (lokalni dev)

Lokalni Postgres se koristi SAMO za razvoj i testove. **Produkcijski VPS Postgres se NE dira** — produkcija koristi drugačiji `DATABASE_URL` sa istom `?schema=ukrstene` izolacijom.

| Stavka | Vrednost |
|---|---|
| Verzija | PostgreSQL 14 (Homebrew) |
| Host / port | `localhost:5432` |
| Superuser rola | `filipnovakovic` (bez lozinke, trust auth na localhost) |
| Dev baza | `ukrstene_dev` |
| Test baza | `ukrstene_test` |
| Prisma schema (izolacija) | `ukrstene` (unutar baze) |
| Dev connection string | `postgresql://filipnovakovic@localhost:5432/ukrstene_dev?schema=ukrstene` |

### Komande

```bash
# Start / stop / status servera
brew services start postgresql@14
brew services stop postgresql@14
brew services list | grep postgres

# Konekcija na dev bazu
psql ukrstene_dev

# Lista baza
psql -lqt | cut -d'|' -f1

# Pregled tabela u 'ukrstene' schemi (jednom kad migracija prođe)
psql ukrstene_dev -c "\dt ukrstene.*"

# (Re)kreiranje baza ako zatreba
createdb ukrstene_dev
createdb ukrstene_test
# dropdb ukrstene_dev   # oprez: briše sve
```

---

## Backend

Lokacija: `backend/`. Env fajl `backend/.env` (gitignored) sadrži `DATABASE_URL`. Šablon je `backend/.env.example`.

```bash
# Iz repo root-a (npm workspaces)
npm install                      # instalira sve workspace-ove

# Testovi
npm -w backend test              # vitest run (jednom)
npm -w backend run test:watch    # vitest watch

# Type-check / build / lint
npm -w backend run build         # tsc
npm -w backend run lint          # eslint

# Prisma (pokretati iz backend/ foldera)
cd backend
npx prisma validate
npx prisma generate
npx prisma migrate dev --name <ime>   # primeni migraciju na dev bazu
npx prisma studio                      # GUI pregled baze

# Seed jezika (idempotentno)
npm -w backend run seed
psql ukrstene_dev -c "SELECT code, name, supported_scripts FROM ukrstene.languages ORDER BY code;"

# Bulk generisanje nivoa (CLI job) — puni 'levels' tabelu
# args: --language <code|id> --script lat|cyr --mode basic|advanced --levelCount N --variationsPerLevel N --seed N
npm -w backend run generate:levels -- --language sr --script lat --mode basic --levelCount 50 --variationsPerLevel 3 --seed 1
psql ukrstene_dev -c "SELECT level_number, difficulty_band, grid_width, grid_height FROM ukrstene.levels ORDER BY level_number LIMIT 20;"
```

### REST API (Fastify) — `backend/src/routes/` + `backend/src/services/`
Pokretanje servera lokalno:
```bash
npm -w backend run dev        # tsx watch src/server.ts (PORT=3000 default)
curl localhost:3000/v1/health # -> {"status":"ok"}
```

Rute (sve pod `/v1`):
| Ruta | Zaštita | Opis |
|---|---|---|
| `GET /v1/health` | — | liveness |
| `POST /v1/auth/anon` | — | `{deviceId}` → JWT (anon nalog) |
| `POST /v1/auth/social` | — | `{provider,token,anonUserId?}` → JWT (Apple/Google), migrira anon napredak |
| `GET /v1/levels/next` | JWT | `?mode&lang&script&count` → neodigrani nivoi (1 varijacija/broj, stabilno po korisniku) |
| `POST /v1/progress` | JWT | upiše rezultat (best-result, idempotentno, Serializable tx) |
| `POST /v1/progress/batch` | JWT | offline flush (atomično, ≤200) |
| `POST /v1/admin/dictionary` | `x-admin-key` | bulk dodavanje reči+asocijacija |
| `POST /v1/admin/generate` | `x-admin-key` | pokreće bulk generisanje (202+jobId) |
| `POST /v1/admin/regenerate` | `x-admin-key` | penzioniše stare + pravi nove varijacije |

**Env varijable (backend/.env):**
| Var | Dev | Produkcija |
|---|---|---|
| `DATABASE_URL` | lokalni Postgres (gore) | VPS Postgres, isti `?schema=ukrstene` |
| `JWT_SECRET` | opciono (dev fallback) | **OBAVEZNO** — app puca na startu u production bez njega (fail-closed) |
| `ADMIN_API_KEY` | postavi za admin rute | **OBAVEZNO** — bez njega admin rute vraćaju 403 (fail-closed) |
| `PORT` | 3000 | po potrebi |

### Generator (čista logika, bez baze) — `backend/src/generator/`
`graphemes` (digrafi), `translit` (ćir↔lat), `grid` (postavljanje reči), `layout` (skandinavka raspored, seeded RNG), `difficulty` (koeficijent 1–100 + pojasevi), `gridData` (JSON ugovor klijent↔server + Zod), `generateLevel` (pipeline za 1 nivo), `bulkGenerate` (batch + persistencija).

> Prisma 7 napomena: URL se čita iz `backend/prisma.config.ts` (koji učitava `.env` preko `dotenv`), NE iz `schema.prisma`. Runtime koristi `@prisma/adapter-pg` driver adapter (`backend/src/db/client.ts`).

---

## Mobile (Expo)

Expo SDK 56 + Expo Router + TypeScript. Kod pod `mobile/src/`, rute pod `mobile/src/app/`.

```bash
npm -w mobile run start          # Expo dev server (Metro); pa 'i' iOS / 'a' Android / 'w' web
npm run start:mobile             # isto, iz root-a
npm -w mobile test               # Jest (jest-expo) + React Native Testing Library
npx tsc --noEmit                 # (iz mobile/) type-check
# Provera da app bundluje bez simulatora:
cd mobile && npx expo export --platform ios   # ili --platform web
npx expo-doctor                  # health check (21/21)
```

**Struktura (`mobile/src/`):**
- `app/` — Expo Router rute: `_layout` (provideri + font/hydration gate), `index` (home), `onboarding` (izbor jezika), `game/[mode]`, `settings`
- `theme/` — `ThemeProvider`/`useTheme`, light "Topla enigmatika" + dark palete, Nunito font
- `i18n/` — i18next, 5 jezika (mk ćirilica), `setLanguage`, device detekcija
- `db/` — expo-sqlite (cached_levels, local_progress), `levelRepo`/`progressRepo` (offline)
- `api/` — tipovani klijent (`createApiClient`) za backend `/v1`, `ApiError`
- `services/` — `sync` (flush nesinhronizovanog napretka + prefetch paketa nivoa)
- `store/` — `useSettings` (zustand + AsyncStorage: language/script/themeMode/checkMode)
- `game/` — `engine` (pure game state: fill, intersekcije, mistakes, isSolved), `gridData.types` (mobile mirror backend GridData), `sampleLevel` (dev fallback), `useLevel` (cache→sample loader)
- `components/grid/` — `Grid`/`Cell`/`ClueCell` (auto-size, fit širine 6–9 bez skrola, asocijacije+strelice, highlight)
- `components/keyboard/` — `Keyboard` + `layouts` (po jeziku/pismu, digrafi jedan taster)
- `game/advanced` — Advanced palette engine (deal 5 iz potrebnih, place/unplace, submit lock/clear/mistake/refill, seeded), `game/rng` (mulberry32)
- `components/palette/` — `LetterPalette`/`LetterTile` (amber pločice, tap-to-place, Potvrdi)
- `screens/BasicGame` + `screens/AdvancedGame` — oba moda igriva (game/[mode] ruta granja basic/advanced); Advanced ima §6.4 animacije (RN Animated) + haptiku

**API base URL:** `app.json` → `expo.extra.apiBaseUrl` (default `http://localhost:3000`). Android emulator: `10.0.2.2`; fizički uređaj: LAN IP host-a; prod: VPS HTTPS preko EAS profila.

> Testovi mobilnog: čista logika + repo SQL (in-memory better-sqlite3) + API/sync (mock fetch). Native expo-sqlite/expo-constants se ne učitavaju u Jest-u — zato tanki interfejsi + injekcija.

---

## CI / Testovi (kapija na svaki deploy)

GitHub Actions workflow: `.github/workflows/ci.yml`. Pokreće se na svaki `push` na `main` i na svaki PR:
`npm ci → prisma generate → lint → tsc --noEmit → backend testovi` (sa `postgres:14` service container-om za integration testove). Deploy (kasnije) zavisi od zelene kapije.

Lokalno pokretanje cele palete testova:
```bash
npm -w backend test       # svi backend testovi (unit + DB integration)
npm -w backend run lint
npx tsc --noEmit --project backend/tsconfig.json
```

Slojevi: unit (čista logika), integration (API + Postgres), component (mobilni UI — kasnije), E2E (Maestro/Detox — kasnije).

## Korisni linkovi
- PRD / dizajn: `docs/plans/2026-06-25-ukrstene-reci-design.md`
- Implementacioni plan: `docs/plans/2026-06-25-ukrstene-reci-implementation.md`
- GitHub: https://github.com/ficanovak/ukrstene-reci

---

## Changelog ovog dokumenta
- 2026-06-25: inicijalna verzija (Postgres lokalni dev, backend komande, placeholder za mobile).
- 2026-06-25: dodate seed komande (Task 1.3); migracija `init` primenjena, 5 jezika seed-ovano.
- 2026-06-25: CI gate dodat; Phase 2 generator kompletan (8 modula, 155 testova); dodate generate:levels CLI komande.
- 2026-06-25: Phase 3 REST API kompletan (auth, levels, progress, admin); 223 testa; dodate API rute + env varijable. JWT i admin-key fail-closed u produkciji.
- 2026-06-25: Mobile scaffold (Expo SDK 56, Task 0.3) + Phase 4 foundation kompletan (theme, i18n, SQLite, API klijent, sync, navigacija); 73 mobilna testa; app bundluje (expo-doctor 21/21).
- 2026-06-26: Phase 5 Basic mod kompletan (game engine, grid renderer, keyboard, BasicGame screen); 167 mobilna testa; vizuelno potvrdjeno na iOS simulatoru (deep link exp://HOST:8081/--/game/basic). Pokretanje: `npm -w mobile run start` pa 'i'.
