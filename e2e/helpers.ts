import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Result as AxeResult } from "axe-core";
import { join } from "node:path";
import { ARTIFACT_DIR, ensureArtifactDirs } from "./paths";

export type Theme = "light" | "dark";

/** WCAG 2.1 A and AA — the Section 508 bar the platform is held to. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/** next-themes writes the chosen theme here (its default `storageKey`) and reads it before paint. */
const THEME_STORAGE_KEY = "theme";

/**
 * Pick the theme for every navigation this page makes.
 *
 * `emulateMedia({ colorScheme })` is useless here: the provider runs with `enableSystem={false}`,
 * so the OS preference is never consulted. Seeding localStorage before the document loads is what
 * next-themes' pre-paint script actually reads, which also means no flash of the wrong theme.
 */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage blocked — the assertion after navigation will catch it */
      }
    },
    [THEME_STORAGE_KEY, theme] as const,
  );
}

/** A silent no-op theme switch would make the dark half of this suite meaningless. */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

/**
 * Navigate and wait until the screen is genuinely finished: network quiet, the landmark and
 * heading present, every skeleton resolved, and web fonts loaded (a swapped font moves text
 * under a contrast check and produces a violation that vanishes on the next run).
 */
export async function gotoSettled(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await settle(page);
}

export async function settle(page: Page): Promise<void> {
  // The dev server keeps an HMR socket open, so treat idle as a hint rather than a gate.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
  await page.locator("main").first().waitFor({ state: "attached", timeout: 60_000 });
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 60_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
}

function formatViolations(violations: AxeResult[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 4)
        .map((node) => `      · ${node.target.join(" ")}\n        ${node.failureSummary?.replace(/\n/g, "\n        ") ?? ""}`)
        .join("\n");
      const more = violation.nodes.length > 4 ? `\n      … and ${violation.nodes.length - 4} more node(s)` : "";
      return `  [${violation.impact ?? "unknown"}] ${violation.id} — ${violation.help}\n    ${violation.helpUrl}\n${nodes}${more}`;
    })
    .join("\n\n");
}

export type ScanOptions = {
  /** CSS selectors to leave out of the scan; every exclusion has to be justified in the report. */
  exclude?: string[];
};

/**
 * Run axe over the current page. Serious and critical findings fail the test; moderate and minor
 * ones are attached to the report and logged, because a government platform should see its whole
 * backlog without letting the small stuff block the build.
 */
export async function scanA11y(page: Page, testInfo: TestInfo, name: string, options: ScanOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const results = await builder.analyze();

  const blocking = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  const advisory = results.violations.filter((violation) => violation.impact !== "serious" && violation.impact !== "critical");

  if (advisory.length > 0) {
    const body = `${name} — ${advisory.length} moderate/minor finding(s)\n\n${formatViolations(advisory)}\n`;
    await testInfo.attach(`axe-advisory-${name}`, { body, contentType: "text/plain" });
    console.log(`\n[axe · advisory] ${body}`);
  }
  if (blocking.length > 0) {
    const body = `${name} — ${blocking.length} serious/critical violation(s)\n\n${formatViolations(blocking)}\n`;
    await testInfo.attach(`axe-blocking-${name}`, { body, contentType: "text/plain" });
    console.log(`\n[axe · BLOCKING] ${body}`);
  }

  expect(blocking.map((violation) => `${violation.id} (${violation.impact})`), `${name}: serious/critical WCAG 2.1 AA violations`).toEqual([]);
}

/** A deliberate, kept screenshot — `dashboard-light-desktop.png` and friends, outside the repo. */
export async function shoot(page: Page, name: string, theme: Theme, viewport: "desktop" | "mobile"): Promise<void> {
  ensureArtifactDirs();
  await page.screenshot({ path: join(ARTIFACT_DIR, `${name}-${theme}-${viewport}.png`), fullPage: true, animations: "disabled" });
}

/** The element the browser currently has focused, as a locator. */
export function focused(page: Page): Locator {
  return page.locator(":focus");
}

/** A short description of the focused element — makes a focus-order failure readable. */
export async function describeFocus(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "(body)";
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 60) ?? "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${label}"`;
  });
}

/** Whether the focused element is drawn with a visible focus ring rather than silently focused. */
export async function focusIsVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.matches(":focus-visible") ?? false);
}
