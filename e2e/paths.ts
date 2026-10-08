import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Where the suite writes the things it wants to keep: the signed-in storage state, the
 * fixture ids discovered at setup, and the deliberate light/dark screenshots.
 *
 * Deliberately outside the repository — a screenshot run must never dirty the working tree — and
 * deliberately not a machine-specific path: a bare `npm run e2e` writes to the OS temp directory
 * (`%TEMP%\ivp-e2e\a11y` on Windows). Set `IVP_E2E_ARTIFACTS` to collect them somewhere
 * else; global setup prints the directory it settled on at the top of every run.
 *
 * Playwright's own failure artefacts still land in `test-results/`, which is git-ignored.
 */
export const ARTIFACT_DIR = process.env.IVP_E2E_ARTIFACTS?.trim() || join(tmpdir(), "ivp-e2e", "a11y");

/** State the run needs before the first test: cookies from a real sign-in, plus seeded ids. */
export const STATE_DIR = join(ARTIFACT_DIR, ".state");
export const STORAGE_STATE = join(STATE_DIR, "storage-state.json");
export const FIXTURES_FILE = join(STATE_DIR, "fixtures.json");

export function ensureArtifactDirs(): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(STATE_DIR, { recursive: true });
}
