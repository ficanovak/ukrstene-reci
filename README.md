# Ukrstene Reci

A crossword game. This is an npm-workspaces monorepo containing the backend API and the mobile app.

## Repo layout

| Path | Description |
| --- | --- |
| `backend/` | API server (TypeScript + Fastify + Prisma, added in later tasks). |
| `mobile/` | Mobile app (Expo / React Native, set up in Task 0.3). |
| `docs/plans/` | Design (PRD) and implementation plan documents. |

## Requirements

- Node 20 (see [`.nvmrc`](./.nvmrc); run `nvm use`).
- npm (workspaces).

## Getting started

Install all workspace dependencies from the repo root:

```sh
npm install
```

## Running

Run the backend:

```sh
npm -w backend run dev
```

Run the mobile app:

```sh
npm -w mobile run start
```

## Documentation

- [Product design / PRD](./docs/plans/2026-06-25-ukrstene-reci-design.md)
- [Implementation plan](./docs/plans/2026-06-25-ukrstene-reci-implementation.md)
