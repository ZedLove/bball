# Bball Agent Instructions

Node.js/TypeScript real-time MLB game tracker. Backend only — no frontend in this repo.

## Tech Stack

- **Runtime**: Node.js ESM (`"type": "module"`) · TypeScript 5.9 · ES2022
- **Module resolution**: `NodeNext` — all local imports **must use `.ts` extensions**. Never `.js`.
- **HTTP**: Express v5 · Socket.IO v4
- **MLB data**: axios against `statsapi.mlb.com/api/v1`
- **Validation**: Zod (env config only)
- **Tests**: Vitest v4 (globals available; still import explicitly) · supertest · socket.io-client
- **Lint/format**: ESLint v10 + typescript-eslint + eslint-plugin-security · Prettier v3

## Commands

```bash
npx tsc --noEmit          # type-check (run after type changes)
npm run lint              # eslint --max-warnings 0 (must be clean)
npm run format:check      # prettier check (must pass before commit)
npm run format            # auto-fix formatting
npm run test:ci           # vitest run — single-pass test suite
npm run test:coverage     # vitest run --coverage
```

Coverage thresholds: lines 93%, functions 91%, branches 86%. `src/dev/**` is excluded.

## Architecture

```
src/
  config/          # Zod env validation (env.ts) + team resolution (teams.ts)
  scheduler/       # MLB API polling, feed parsing, event enrichment
  server/          # Express app, Socket.IO setup, socket event contracts
  routes/          # Express route handlers for runtime requests (e.g. health.ts)
  dev/             # Simulator (DEV_MODE=true replaces scheduler)
plans/             # Markdown feature plans — source of truth for roadmap
```

**Key boundaries:**

- `src/scheduler/game-feed-types.ts` — raw MLB API shapes only
- `src/server/socket-events.ts` — domain/emitted types and `SOCKET_EVENTS` constant

## Conventions

**Imports**

- `.ts` extension on every local import — `import { foo } from './foo.ts'`
- `import type` for type-only imports
- No barrel/index re-export files — import directly from the source module

**TypeScript**

- `strict: true` — no `any`, no non-null assertions without justification
- Null coalescing defaults in mappers: `pe.count?.balls ?? 0`, `pd?.startSpeed ?? null`
- Absent optional fields → `null` in emitted types (not `undefined`, not omitted)

**Testing — factory pattern**
Every test file defines its own local `make*` factory (never a shared utility):

```typescript
function makePitchEvent(overrides: Partial<PlayEvent> = {}): PlayEvent {
  return { ...defaults, ...overrides }; // overrides spread last
}
```

- Exact-value assertions preferred (`toBe`, `toEqual`) over `toBeTruthy`/`toBeFalsy`
- JSON fixtures live in `src/scheduler/__fixtures__/` and are imported with `with { type: 'json' }`
- Fixture-wrapping helpers (e.g. `withCurrentPlay()`) scope overrides to the tested boundary

**Socket events**

- Always use the `SOCKET_EVENTS` constant — never raw string event names

**Commits** — Conventional Commits, single-line:

```
feat(scope): description
feat!: description           # breaking change
fix(scope): description
refactor(scope): description
chore(scope): description
```

Common scopes: `scheduler`, `feed`, `socket`, `simulator`, `config`, `types`, `dev`  
Prefer including test/type work inside `feat` commits. No `fix` commits on feature branches.

## Plans

Feature roadmap lives in `plans/next-steps.md`. Individual feature detail plans are in `plans/feature-*.md`. The feature plan is the source of truth for scope, decisions, and implementation phases.
