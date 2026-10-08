import { expect, type Page, test } from "@playwright/test";
import { fixtures } from "./fixtures";
import { expectTheme, gotoSettled, setTheme, shoot, type Theme } from "./helpers";

/**
 * A regional lead reads this on a phone between meetings. At 390 CSS pixels nothing may
 * overflow sideways, the desktop rail must give way to the sheet, and the record's summary
 * rail has to stack under the body instead of squeezing it.
 */

const WIDTH = 390;
const THEMES: Theme[] = ["light", "dark"];

test.use({ viewport: { width: WIDTH, height: 844 } });

/** How far the document can be scrolled horizontally — anything above zero is an overflow. */
async function horizontalOverflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number; widest: string[] }> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const widest: string[] = [];
    if (root.scrollWidth > root.clientWidth) {
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
        const box = el.getBoundingClientRect();
        if (box.width > 0 && box.right > root.clientWidth + 1) {
          widest.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 3).join(".")}` : ""} → right ${Math.round(box.right)}`);
          if (widest.length >= 6) break;
        }
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, widest };
  });
}

function pages(): [name: string, path: string][] {
  return [
    ["dashboard", "/"],
    ["meetings", "/meetings"],
    ["record", `/meetings/${fixtures().meetingId}`],
    ["activity", "/activity"],
    ["documents", "/documents"],
    ["reports", "/reports"],
    ["country", `/countries/${fixtures().countryCode}`],
  ];
}

test.describe("mobile at 390px", () => {
  for (const theme of THEMES) {
    test(`no horizontal overflow · ${theme}`, async ({ page }) => {
      await setTheme(page, theme);
      for (const [name, path] of pages()) {
        await gotoSettled(page, path);
        await expectTheme(page, theme);
        await shoot(page, name, theme, "mobile");

        const { scrollWidth, clientWidth, widest } = await horizontalOverflow(page);
        expect(scrollWidth, `${name} (${theme}) scrolls sideways at ${WIDTH}px (viewport ${clientWidth}px). Widest boxes:\n  ${widest.join("\n  ") || "(none identified)"}`).toBeLessThanOrEqual(WIDTH);
      }
    });
  }

  test("the desktop rail gives way to the hamburger sheet", async ({ page }) => {
    await gotoSettled(page, "/");

    await expect(page.locator('aside[aria-label="Sidebar"]'), "the desktop rail must be hidden on a phone").toBeHidden();

    const hamburger = page.getByRole("button", { name: "Open navigation" });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    const sheetNav = sheet.getByRole("navigation", { name: "Primary" });
    await expect(sheetNav).toBeVisible();
    // `exact`: the tree's child rows say "… meetings" in their count pills, so the group's own
    // row is the only link named exactly "Meetings".
    await expect(sheetNav.getByRole("link", { name: "Meetings", exact: true })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("the record's summary rail stacks below the body", async ({ page }) => {
    await gotoSettled(page, `/meetings/${fixtures().meetingId}`);

    const rail = page.locator('aside[aria-label="Meeting summary"]');
    await expect(rail).toBeVisible();
    // The rail's sibling: the column the tab content is rendered into.
    const body = page.locator('aside[aria-label="Meeting summary"]').locator("xpath=preceding-sibling::div[1]");

    const railBox = await rail.boundingBox();
    const bodyBox = await body.boundingBox();
    expect(railBox, "the summary rail should have a box").not.toBeNull();
    expect(bodyBox, "the record body should have a box").not.toBeNull();
    if (!railBox || !bodyBox) return;

    expect(railBox.y, `the rail should sit under the body, not beside it (rail y=${railBox.y}, body ends at ${bodyBox.y + bodyBox.height})`).toBeGreaterThanOrEqual(bodyBox.y + bodyBox.height - 1);
    expect(Math.abs(railBox.x - bodyBox.x), "stacked, the rail should share the body's left edge").toBeLessThanOrEqual(2);
    expect(railBox.width, "stacked, the rail should take the full column width").toBeGreaterThan(bodyBox.width * 0.9);
  });
});
