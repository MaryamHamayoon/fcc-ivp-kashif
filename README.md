# IVP — FCC International Visitors Program platform

Internal web application for the FCC Office of International Affairs (OIA) to run the
International Visitors Program: meeting lifecycle, delegations and FCC experts, documents,
a structured activity/follow-up log, a global reach map and executive reporting.

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 · Drizzle ORM on
Postgres (embedded PGlite locally, Neon when hosted) · D3 · MapLibre GL · Vitest · Playwright.

## Running it

Requires Node.js 20.9 or later (`.nvmrc` pins 22).

```bash
npm install
cp .env.example .env.local   # defaults use an embedded PGlite database in ./.pglite
npm run dev                  # http://localhost:3000
```

The first start creates the database, runs the migrations and seeds synthetic data. On the
sign-in page, accept the system-use notice to enter as the program administrator; no password
is needed in this phase.

| Script | Purpose |
|---|---|
| `npm run dev` | development server on :3000 |
| `npm run build` | production build (`next build`) |
| `npm start` | serve the build; `npm run start -- -p 3100` for another port |
| `npm run typecheck` | TypeScript strict check (the app; `npx tsc --noEmit -p e2e` for the suite) |
| `npm run lint` | ESLint |
| `npm test` | Vitest — domain, services, components |
| `npm run test:zones` | the map's date tests again in two far time zones |
| `npm run e2e:a11y` | axe/WCAG 2.1 AA, keyboard, reduced-motion and responsive checks |
| `npm run e2e:smoke` | the lifecycle end to end against a production build |
| `npm run e2e` | both Playwright projects |
| `npm run db:migrate` / `npm run db:seed` / `npm run db:reset` | schema and synthetic data |

Two Playwright projects, because they need different servers:

- **`a11y`** runs against the dev server you already have up on **:3000** (or the one
  `E2E_BASE_URL` names) and does not start one. Bring up `npm run dev` first. It signs in once
  through the login page and reuses that session; screenshots land outside the repo
  (`%TEMP%\ivp-e2e\a11y`, or `IVP_E2E_ARTIFACTS`).
- **`smoke`** starts its own **production** server on **:3100** with an in-memory database
  seeded at boot, so it can file a meeting and move its status without touching your dev data.
  **Run `npm run build` first** — `next start` needs the build, and that goes for `npm run e2e`
  too, which runs both projects. An existing server on :3100 is reused.

Playwright needs its browser once: `npx playwright install chromium`.

## Environment

See `.env.example` for every variable and its default. In short: `DB_DRIVER` picks `pglite`
(on disk, the local default), `pglite-memory` (in memory, seeded at boot — sandbox deploys) or
`neon`; `AUTH_SECRET` signs the session cookie and is **required** in production; `SITE_PASSCODE`
adds an optional passcode gate in front of the whole site.

## Deploying

### Demo sandbox

A demo runs the production build (`npm run build && npm start`) against `pglite-memory`: the
database is rebuilt and reseeded every time the server starts, which is exactly what a demo
wants and what nothing real should ever use. Set these in the server's environment:

| Variable | Value |
|---|---|
| `DB_DRIVER` | `pglite-memory` |
| `DB_SEED_ON_BOOT` | `true` |
| `AUTH_SECRET` | 32+ random characters |
| `SITE_PASSCODE` | optional — a short passcode gating the whole site |

`/api/health` is unauthenticated and reports the driver, whether the data is ephemeral and
whether the seed ran — the first thing to check after a deploy.

