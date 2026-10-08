import { expect, type Page, test } from "@playwright/test";
import { fixtures } from "./fixtures";
import { describeFocus, focusIsVisible, gotoSettled } from "./helpers";

/**
 * IVP has to be operable end to end without a mouse: a coordinator on a locked-down
 * workstation, and anyone using a screen reader or a switch. These are the paths that would
 * strand such a user — the skip link, the rail, the board's move menu, the status dialog and
 * the command palette — checked for focus order, a visible ring, a real trap and a return.
 */

/** Whether the browser's focus currently sits inside `selector` (and not on the container itself). */
function focusInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const active = document.activeElement;
    const root = document.querySelector(sel);
    return Boolean(active && root && root.contains(active) && active !== root);
  }, selector);
}

test.describe("keyboard navigation", () => {
  test("the first Tab reaches the skip link, then the primary nav, then the page itself", async ({ page }) => {
    await gotoSettled(page, "/");

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink, "the first tab stop must be the skip link").toBeFocused();
    expect(await focusIsVisible(page), "the skip link must show a focus ring").toBe(true);

    // Walk the rest of the header until focus enters the rail, and then the page body.
    const trail: string[] = [await describeFocus(page)];
    let navStop = -1;
    let mainStop = -1;
    for (let step = 1; step <= 40 && mainStop === -1; step++) {
      await page.keyboard.press("Tab");
      trail.push(await describeFocus(page));
      if (navStop === -1 && (await focusInside(page, 'nav[aria-label="Primary"]'))) navStop = step;
      if (navStop !== -1 && mainStop === -1 && (await focusInside(page, "#main"))) mainStop = step;
    }

    expect(navStop, `never reached nav[aria-label="Primary"]; focus went:\n  ${trail.join("\n  ")}`).toBeGreaterThan(0);
    expect(mainStop, `never reached #main; focus went:\n  ${trail.join("\n  ")}`).toBeGreaterThan(navStop);
    expect(await focusIsVisible(page), "the first control in the page must show a focus ring").toBe(true);
  });

  test("activating the skip link moves focus into the main landmark", async ({ page }) => {
    await gotoSettled(page, "/");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.locator("#main"), "Enter on the skip link must land focus on the main landmark").toBeFocused();
  });

  test("the board's move menu opens with Enter and closes with Escape, back onto its trigger", async ({ page }) => {
    await gotoSettled(page, "/meetings?layout=board");

    // Cards whose status has nowhere to go render a disabled trigger; take one that can move.
    const trigger = page.locator('button[aria-label^="Move "]:not([disabled])').first();
    await trigger.waitFor({ state: "visible" });
    await trigger.focus();
    expect(await focusIsVisible(page), "the move trigger must show a focus ring").toBe(true);

    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger, "Escape must hand focus back to the trigger, not to the document").toBeFocused();
  });

  test("the status dialog traps focus and returns it to the trigger on Escape", async ({ page }) => {
    await gotoSettled(page, `/meetings/${fixtures().meetingId}`);

    const trigger = page.getByRole("button", { name: "Change status" });
    await trigger.waitFor({ state: "visible" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The dialog names itself after the move when only one is allowed ("Close out"), so the
    // stable thing to assert is that it opened on *this* meeting.
    await expect(dialog).toContainText(fixtures().meetingCode);

    // Tab all the way round: focus must never come to rest on the page behind the dialog.
    // The wrap-around momentarily passes through the library's sentinel spans, so this polls
    // for where focus settles rather than sampling the instant after the keypress.
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() => focusInside(page, '[role="dialog"]'), { timeout: 2_000, message: `Tab ${step + 1} left the dialog` })
        .toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger, "Escape must hand focus back to the trigger").toBeFocused();
  });

  test("the library's drawer opens on Enter, holds focus, and hands it back to the row on Escape", async ({ page }) => {
    await gotoSettled(page, "/documents");

    // Each row's title is the control that opens its drawer; the first one that is on screen.
    const title = page.getByRole("table").getByRole("button").first();
    await title.waitFor({ state: "visible" });
    await title.focus();
    expect(await focusIsVisible(page), "the row's title must show a focus ring").toBe(true);
    const name = (await title.textContent())?.trim() ?? "";

    await page.keyboard.press("Enter");
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("heading", { name })).toBeVisible();
    await expect.poll(() => focusInside(page, '[role="dialog"]'), { message: "focus must move into the drawer" }).toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(title, "Escape must hand focus back to the row that opened the drawer").toBeFocused();
  });

  test("the command palette opens with Ctrl+K and closes with Escape", async ({ page }) => {
    await gotoSettled(page, "/");

    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await expect(palette).toBeVisible();
    const search = page.getByRole("combobox", { name: "Search" });
    await expect(search, "the palette must put the caret in its search box").toBeFocused();

    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });
});
