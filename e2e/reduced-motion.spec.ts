import { expect, test } from "@playwright/test";
import { fixtures } from "./fixtures";
import { gotoSettled, settle } from "./helpers";
import { STORAGE_STATE } from "./paths";

/**
 * "Prefers reduced motion" has to mean *stopped*, not *slowed down*: the program band's counters
 * land on their number, no CSS animation is left running, and the map's arcs stop flowing
 * rather than looping a gold pulse at 60fps for an effect nobody asked to see.
 */

/** The four figures on the program band, in the order they are laid out. */
const BAND_FIGURES = "[data-stat-figure]";

/** rAF callbacks scheduled in half a second. React may schedule a handful around a resize or
 *  a hover; anything above this is a running animation loop. */
const IDLE_RAF_BUDGET = 5;

// Playwright 1.62 moved the emulation flags off the top level of `use`; they live in contextOptions.
test.use({ contextOptions: { reducedMotion: "reduce" } });

test.describe("reduced motion", () => {
  test("the preference actually reaches the page", async ({ page }) => {
    await gotoSettled(page, "/");
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  });

  test("the band's counters show their final value straight away", async ({ page, browser }, testInfo) => {
    // Read the figures as early as they exist — before the 900 ms count-up could have finished.
    await page.goto("/", { waitUntil: "commit" });
    const figures = page.locator(BAND_FIGURES);
    await figures.first().waitFor({ state: "attached" });
    const immediate = (await figures.allInnerTexts()).map((value) => value.trim());
    expect(immediate, "the program band shows four figures").toHaveLength(4);

    // The same dashboard without the preference, given time for the count-up to land.
    const baseURL = testInfo.project.use.baseURL ?? "http://localhost:3000";
    const reference = await browser.newContext({ baseURL, storageState: STORAGE_STATE, reducedMotion: "no-preference" });
    try {
      const referencePage = await reference.newPage();
      await referencePage.goto("/", { waitUntil: "domcontentloaded" });
      await settle(referencePage);
      await expect(async () => {
        const settled = (await referencePage.locator(BAND_FIGURES).allInnerTexts()).map((value) => value.trim());
        expect(settled, "the animated dashboard must land on the same figures").toEqual(immediate);
      }).toPass({ timeout: 10_000 });
    } finally {
      await reference.close();
    }

    expect(immediate.every((value) => value.length > 0)).toBe(true);
  });

  test("no CSS animation is left running", async ({ page }) => {
    await gotoSettled(page, "/");

    const running = await page.evaluate(() =>
      document
        .getAnimations()
        .map((animation) => {
          const timing = animation.effect?.getComputedTiming();
          const duration = typeof timing?.duration === "number" ? timing.duration : Number.NaN;
          const named = animation as Animation & { animationName?: string; transitionProperty?: string };
          return { name: named.animationName ?? named.transitionProperty ?? animation.constructor.name, durationMs: duration, state: animation.playState };
        })
        // "auto" durations (NaN here) belong to scroll-driven effects, which do not tick on their own.
        .filter((entry) => Number.isFinite(entry.durationMs) && entry.durationMs > 0),
    );

    expect(running, "reduced motion must leave nothing animating").toEqual([]);
  });

  test("the map runs no animation loop and withdraws its pause", async ({ page }) => {
    await page.addInitScript(() => {
      const win = window as Window & { __rafCount?: number };
      win.__rafCount = 0;
      const original = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => {
        win.__rafCount = (win.__rafCount ?? 0) + 1;
        return original(callback);
      };
    });
    await gotoSettled(page, "/");

    const map = page.getByRole("region", { name: "Global reach" });
    await expect(map).toBeVisible();
    // MapLibre arrives on demand; everything below is about the map once it is ready.
    await expect(map.getByText("Loading the map…")).toHaveCount(0, { timeout: 15_000 });
    // Without WebGL the card shows its list instead, and every check below would pass on nothing.
    await expect(map.locator("canvas.maplibregl-canvas"), "the card must draw its map, not fall back to its list").toBeVisible();

    // The pause exists only when something would otherwise move (WCAG 2.2.2); under a
    // reduced-motion preference nothing does, so the app withdraws it rather than lying about it.
    await expect(map.getByRole("button", { name: "Pause the signals" }), "reduced motion should leave nothing to pause").toHaveCount(0);

    // Not even a paused animation: the signals are drawn once, as still rings, and nothing on the card eases.
    // Only time-driven animations count: a scroll timeline advances with the reader's finger, not on its own.
    const inside = await map.evaluate((root) =>
      document.getAnimations().filter((animation) => animation.timeline === document.timeline && animation.effect instanceof KeyframeEffect && animation.effect.target instanceof Element && root.contains(animation.effect.target)).length,
    );
    expect(inside, "reduced motion must leave nothing animating inside the map").toBe(0);

    // Give the map a moment to finish drawing the tiles it has just received, then count frames over half a second.
    await page.waitForTimeout(1_000);
    const before = await page.evaluate(() => (window as Window & { __rafCount?: number }).__rafCount ?? 0);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => (window as Window & { __rafCount?: number }).__rafCount ?? 0);

    expect(after - before, `the map kept requesting frames (${after - before} in 500 ms) — an animation loop is still running`).toBeLessThanOrEqual(IDLE_RAF_BUDGET);
  });

  test("the dossier's timeline draws its marks in place, with nothing settling in", async ({ page }) => {
    await gotoSettled(page, `/countries/${fixtures().countryCode}`);

    const figure = page.getByRole("figure", { name: "Engagement timeline" });
    await expect(figure).toBeVisible();
    const marks = figure.locator("svg a[href^='/meetings/']");
    await expect(marks.first(), "a country with a dossier has meetings to plot").toBeVisible();

    // Every mark is already at its full size: no radius is mid-flight, none is still zero.
    const radii = await marks.locator("circle:last-child").evaluateAll((circles) => circles.map((c) => Number(c.getAttribute("r"))));
    expect(radii.length).toBeGreaterThan(0);
    for (const r of radii) expect(r).toBeGreaterThanOrEqual(3.5);

    const running = await figure.evaluate((root) =>
      document.getAnimations().filter((animation) => animation.timeline === document.timeline && animation.effect instanceof KeyframeEffect && animation.effect.target instanceof Element && root.contains(animation.effect.target)).length,
    );
    expect(running, "reduced motion must leave nothing animating inside the timeline").toBe(0);
  });
});
