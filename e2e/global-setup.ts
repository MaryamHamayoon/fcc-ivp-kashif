import { chromium, type FullConfig } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { runsProject } from "../playwright.config";
import { ARTIFACT_DIR, ensureArtifactDirs, FIXTURES_FILE, STORAGE_STATE } from "./paths";
import type { Fixtures } from "./fixtures";

/**
 * One real sign-in for the whole run — for the `a11y` project only.
 *
 * The suite never forges a session cookie: it opens `/login` and accepts the system-use notice,
 * exactly as a person would, so the proxy, the server action and the cookie flags are all
 * exercised before a single assertion runs. The resulting cookies are saved as `storageState`.
 *
 * It also discovers the seeded ids the specs need (a meeting that still has somewhere to go, a
 * country and an organization with a dossier, a document for the drawer) — nothing in this suite
 * hardcodes a seeded id.
 *
 * `smoke` signs in for itself against its own server on :3100, so a `--project smoke` run must
 * not reach for the dev server on :3000, which may not even be up. Playwright runs one global
 * setup for the whole invocation and never narrows `config.projects` to the `--project`
 * selection, so `runsProject` (exported by the config, read from the CLI) is the gate.
 */

/** Statuses that still have an onward move, so "Change status" and the board's move menu exist. */
const MOVABLE_STATUSES = new Set(["requested", "developing", "clearance", "confirmed", "completed"]);

type MeetingRow = { id: string; code: string; status: string; countryCode: string; orgId: string | null };

function isMeetingRow(value: unknown): value is MeetingRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.code === "string" && typeof row.status === "string" && typeof row.countryCode === "string" && (typeof row.orgId === "string" || row.orgId === null);
}

type DocumentRow = { id: string };

function isDocumentRow(value: unknown): value is DocumentRow {
  return Boolean(value) && typeof value === "object" && typeof (value as Record<string, unknown>).id === "string";
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  if (!runsProject("a11y")) {
    console.log("[e2e] a11y not selected — skipping the dev-server sign-in");
    return;
  }

  ensureArtifactDirs();
  const baseURL = config.projects.find((project) => project.name === "a11y")?.use.baseURL ?? "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    // Accepting the system-use notice signs in as the administrator, who sees every control.
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    const accept = page.getByRole("button", { name: "Accept and sign in" });
    await accept.waitFor({ state: "visible", timeout: 60_000 });
    const identity = ((await page.locator("#signin-identity").textContent()) ?? "").replace(/^Phase 1 signs you in as /, "").split(". ")[0] || "(unknown identity)";
    await accept.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 });

    const meetings = await page.evaluate(async () => {
      const response = await fetch("/api/meetings?sort=updated&dir=desc&pageSize=200", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`GET /api/meetings → ${response.status}`);
      return (await response.json()) as { items: unknown[] };
    });
    const rows = meetings.items.filter(isMeetingRow);
    if (rows.length === 0) throw new Error("No seeded meetings came back from /api/meetings — is the database seeded?");

    const documents = await page.evaluate(async () => {
      const response = await fetch("/api/documents?pageSize=10", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`GET /api/documents → ${response.status}`);
      return (await response.json()) as { items: unknown[] };
    });
    const document = documents.items.find(isDocumentRow);
    if (!document) throw new Error("No seeded documents came back from /api/documents — is the database seeded?");

    const movable = rows.find((row) => MOVABLE_STATUSES.has(row.status)) ?? rows[0]!;
    const withOrg = rows.find((row) => row.orgId !== null);
    if (!withOrg?.orgId) throw new Error("No seeded meeting names an organization — is the database seeded?");
    const fixtures: Fixtures = {
      identity,
      meetingId: movable.id,
      meetingCode: movable.code,
      meetingStatus: movable.status,
      countryCode: (rows.find((row) => row.countryCode) ?? movable).countryCode,
      organizationId: withOrg.orgId,
      documentId: document.id,
      meetingCount: rows.length,
    };

    await context.storageState({ path: STORAGE_STATE });
    writeFileSync(FIXTURES_FILE, `${JSON.stringify(fixtures, null, 2)}\n`, "utf8");

    console.log(`[e2e] signed in — ${identity}`);
    console.log(`[e2e] record under test — ${fixtures.meetingCode} (${fixtures.meetingStatus}) of ${fixtures.meetingCount} meetings`);
    console.log(`[e2e] artifacts → ${ARTIFACT_DIR}`);
  } finally {
    await context.close();
    await browser.close();
  }
}
