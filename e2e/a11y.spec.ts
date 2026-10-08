import { type Page, test } from "@playwright/test";
import { fixtures, recordPaths, reportPaths } from "./fixtures";
import { expectTheme, gotoSettled, scanA11y, setTheme, shoot, type Theme } from "./helpers";

/**
 * Every screen IVP ships, scanned by axe against WCAG 2.1 A + AA, in both themes.
 *
 * Serious and critical findings fail. Moderate and minor ones are attached to the report and
 * printed, so the backlog is visible without a cosmetic nit blocking a deploy.
 */

const THEMES: Theme[] = ["light", "dark"];

/** Paths are resolved inside the test, so seeded ids are read after global setup has found them. */
type Target = { name: string; path: () => string };

const TARGETS: Target[] = [
  { name: "dashboard", path: () => "/" },
  { name: "meetings-table", path: () => "/meetings" },
  { name: "meetings-board", path: () => "/meetings?layout=board" },
  { name: "meetings-calendar", path: () => "/meetings?layout=calendar" },
  { name: "meeting-new", path: () => "/meetings/new" },
  ...recordTargets(),
  { name: "directory-experts", path: () => "/directory" },
  { name: "directory-organizations", path: () => "/directory?tab=organizations" },
  { name: "countries", path: () => "/countries" },
  { name: "country-dossier", path: () => `/countries/${fixtures().countryCode}` },
  { name: "organization-dossier", path: () => `/directory/organizations/${fixtures().organizationId}` },
  { name: "activity", path: () => "/activity" },
  // The waits still open: the one place the age colours carry text, so the one place their contrast is tested.
  { name: "activity-open-follow-ups", path: () => "/activity?scope=open" },
  { name: "documents", path: () => "/documents" },
  { name: "documents-drawer", path: () => `/documents?doc=${fixtures().documentId}` },
  ...reportTargets(),
  { name: "reports-brief", path: () => "/reports/brief" },
];

function reportTargets(): Target[] {
  return reportPaths().map(([name, path]) => ({ name, path: () => path }));
}

function recordTargets(): Target[] {
  // Six fixed tabs; the id behind them is looked up when the test runs.
  return ["record-overview", "record-people", "record-schedule", "record-agenda", "record-documents", "record-activity"].map((name, index) => ({
    name,
    path: () => recordPaths()[index]![1],
  }));
}

test.describe("sign-in page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const theme of THEMES) {
    test(`login · ${theme}`, async ({ page }, testInfo) => {
      await setTheme(page, theme);
      await gotoSettled(page, "/login");
      await expectTheme(page, theme);
      await shoot(page, "login", theme, "desktop");
      await scanA11y(page, testInfo, `login (${theme})`);
    });
  }
});

test.describe("signed-in screens", () => {
  for (const theme of THEMES) {
    for (const target of TARGETS) {
      test(`${target.name} · ${theme}`, async ({ page }, testInfo) => {
        await setTheme(page, theme);
        await gotoSettled(page, target.path());
        await expectTheme(page, theme);
        await shoot(page, target.name, theme, "desktop");
        await scanA11y(page, testInfo, `${target.name} (${theme})`);
      });
    }
  }
});

/** The window event the shell dispatches to open the panel; see `lib/preferences/open.ts`. */
const OPEN_PREFERENCES_EVENT = "ivp:open-preferences";

async function openPreferences(page: Page): Promise<void> {
  await page.evaluate((name) => window.dispatchEvent(new CustomEvent(name, { detail: {} })), OPEN_PREFERENCES_EVENT);
  await page.getByRole("dialog", { name: "Display & accessibility" }).waitFor();
}

/**
 * The panel opens over whatever screen the reader is on; `/meetings` is chosen so a finding here
 * is a finding about the panel, and the screens above keep reporting their own.
 */
test.describe("display & accessibility panel", () => {
  for (const theme of THEMES) {
    test(`preferences · ${theme}`, async ({ page }, testInfo) => {
      await setTheme(page, theme);
      await gotoSettled(page, "/meetings");
      await expectTheme(page, theme);
      await openPreferences(page);
      await shoot(page, "preferences", theme, "desktop");
      await scanA11y(page, testInfo, `preferences (${theme})`);
    });
  }
});
