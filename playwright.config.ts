import { defineConfig, devices } from "@playwright/test";
import { STORAGE_STATE } from "./e2e/paths";

/**
 * Two suites, two servers.
 *
 * `a11y` — accessibility, keyboard, reduced-motion and responsive checks against the dev server
 * the team already has up on :3000, or on the one `E2E_BASE_URL` names. There is deliberately
 * no `webServer` for it: that server compiles routes on first request and writes to a
 * single-writer PGlite file, so the run is serial with generous navigation timeouts and must
 * never own (or restart) the process.
 *
 * `smoke` — the lifecycle end to end against a *production* build on :3100 whose database lives
 * only in memory and is seeded at boot. Playwright starts and stops that server itself, so the
 * run can create a meeting, log activity and move a status without touching anyone's dev data.
 */

/** Where a machine's :3000 belongs to another project, run the suite with `E2E_BASE_URL=http://localhost:3001`. */
const A11Y_BASE_URL = process.env.E2E_BASE_URL?.trim() || "http://localhost:3000";
const SMOKE_PORT = 3100;
const SMOKE_BASE_URL = `http://localhost:${SMOKE_PORT}`;

/** Throwaway: the smoke server is local, its data dies with it, and it signs nothing real. */
const SMOKE_AUTH_SECRET = "ivp-smoke-e2e-secret-not-a-real-key";

export type ProjectName = "a11y" | "smoke";

/**
 * Whether `name` is part of this invocation.
 *
 * Playwright keeps the `--project` selection to itself — `FullConfig.projects` is always the
 * declared set, never the filtered one — so the CLI is read here instead, in the one file that
 * declares the projects. `e2e/global-setup.ts` imports this to skip its :3000 sign-in when only
 * `smoke` runs, and the `webServer` below uses it so `npm run e2e:a11y` never needs a production
 * build to exist. Both callers run in the runner's own process, so they see the same argv.
 *
 * No `--project` means every project runs; a wildcard is treated as "everything" rather than
 * re-implementing Playwright's pattern matching.
 */
export function runsProject(name: ProjectName, argv: readonly string[] = process.argv): boolean {
  const selected = new Set<string>();
  argv.forEach((arg, index) => {
    if (arg === "--project") {
      const value = argv[index + 1];
      if (value !== undefined && !value.startsWith("-")) selected.add(value.toLowerCase());
    } else if (arg.startsWith("--project=")) {
      selected.add(arg.slice("--project=".length).toLowerCase());
    }
  });
  if (selected.size === 0) return true;
  for (const entry of selected) if (entry.includes("*")) return true;
  return selected.has(name);
}

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  globalSetup: "./e2e/global-setup.ts",

  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",

  timeout: 120_000,
  expect: { timeout: 10_000 },

  use: {
    ...devices["Desktop Chrome"],
    // First hit on a dev-server route pays for compilation; everything after it is fast.
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },

  projects: [
    {
      name: "a11y",
      testIgnore: /smoke\.spec\.ts$/,
      use: { baseURL: A11Y_BASE_URL, storageState: STORAGE_STATE },
    },
    {
      name: "smoke",
      testMatch: /smoke\.spec\.ts$/,
      // Nothing is precompiled away here, but every step is a real round trip through a
      // server action, so the flow gets room without inviting a hung test.
      timeout: 90_000,
      // The flow signs in as two different people; it starts from an empty jar each time.
      use: { baseURL: SMOKE_BASE_URL, storageState: { cookies: [], origins: [] } },
    },
  ],

  webServer: runsProject("smoke")
    ? {
        command: `npm run start -- -p ${SMOKE_PORT}`,
        // Unauthenticated liveness probe (the proxy excludes it), so "up" means "database ready".
        url: `${SMOKE_BASE_URL}/api/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          NODE_ENV: "production",
          DB_DRIVER: "pglite-memory",
          DB_SEED_ON_BOOT: "true",
          AUTH_SECRET: SMOKE_AUTH_SECRET,
          PORT: String(SMOKE_PORT),
        },
      }
    : undefined,
});
