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
```

> Prisma 7 napomena: URL se čita iz `backend/prisma.config.ts` (koji učitava `.env` preko `dotenv`), NE iz `schema.prisma`. Runtime koristi `@prisma/adapter-pg` driver adapter (`backend/src/db/client.ts`).

---

## Mobile (Expo)

> Još nije scaffold-ovano (Task 0.3). Biće dopunjeno kad se kreira `mobile/` Expo aplikacija.

Planirane komande:
```bash
npm -w mobile run start          # Expo dev server (Metro)
# i / a u Metro terminalu -> iOS simulator / Android emulator
npm -w mobile test               # Jest + React Native Testing Library
```

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
