import { expect, type Locator, type Page, test } from "@playwright/test";
import { describeFocus, expectTheme, focusIsVisible, scanA11y, settle, setTheme, shoot, type Theme } from "./helpers";

/**
 * Global reach is the one screen IVP draws with WebGL, so it is the one the component tests
 * cannot see: they drive MapLibre through a fake. Here the real map draws in Chromium (WebGL 2
 * through SwiftShader), and the full screen at `/reach` is held to the bar every other screen is:
 * axe in all six appearances and in every state a reader can put it in, a keyboard walk from the
 * skip link, three widths at which the page never scrolls, a signal loop that stops when paused
 * and never starts under reduced motion, and a kept screenshot of every range for a person to look
 * at. The dashboard's Global reach card runs the same map, so it is scanned in the same six
 * appearances.
 *
 * Nothing here hardcodes a seeded id: the country and the meeting are whichever the page lists first.
 */

// The full screen's floating layout is drawn for a desktop window; the widths and the drawer choose their own.
test.use({ viewport: { width: 1440, height: 900 } });

/** MapLibre's canvas: it is in the page once the engine has started. */
const MAP_CANVAS = "canvas.maplibregl-canvas";

/** MapLibre arrives on demand and SwiftShader draws in software, so the map's first draw gets far longer than a screen's. */
const MAP_TIMEOUT = 60_000;

/** rAF callbacks scheduled in half a second. React may schedule a handful around a resize or
 *  a hover; anything above this is a running animation loop. The same budget as reduced-motion.spec.ts. */
const IDLE_RAF_BUDGET = 5;

/** Where Display & accessibility keeps its choices; the root layout's boot script stamps them on <html> before first paint. */
const PREFERENCES_STORAGE_KEY = "ivp.prefs";

/**
 * A look Display & accessibility offers. Light and Dark are next-themes' own; Hybrid is the light
 * theme with the rail's dark chrome, which every surface of the full screen wears
 * (`data-rail-surface`). Each comes in both accents.
 */
type Appearance = { name: string; theme: Theme; accent: "green" | "navy"; rail: "match" | "dark" };

/** What a reader gets with nothing stored: Hybrid, in green. */
const NEW_READER: Appearance = { name: "hybrid-green", theme: "light", accent: "green", rail: "dark" };

const APPEARANCES: Appearance[] = [
  { name: "light-green", theme: "light", accent: "green", rail: "match" },
  { name: "light-navy", theme: "light", accent: "navy", rail: "match" },
  { name: "dark-green", theme: "dark", accent: "green", rail: "match" },
  { name: "dark-navy", theme: "dark", accent: "navy", rail: "match" },
  NEW_READER,
  { name: "hybrid-navy", theme: "light", accent: "navy", rail: "dark" },
];

/**
 * Pick the appearance for every navigation this page makes, as the preferences panel leaves it:
 * the theme in next-themes' key, and the accent and the rail's tone in the app's own preferences.
 * Both are read before first paint, so the page never shows another look first.
 */
async function setAppearance(page: Page, appearance: Appearance): Promise<void> {
  await setTheme(page, appearance.theme);
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* storage blocked — expectAppearance will catch it */
      }
    },
    [PREFERENCES_STORAGE_KEY, JSON.stringify({ accent: appearance.accent, rail: appearance.rail })] as const,
  );
}

/**
 * A silent no-op would scan the same look six times. The stylesheet dresses the page by these
 * attributes, and a base value (green, a rail that matches the page) is never written, so its
 * absence is the proof.
 */
async function expectAppearance(page: Page, appearance: Appearance): Promise<void> {
  await expectTheme(page, appearance.theme);
  const html = page.locator("html");
  if (appearance.accent === "navy") await expect(html, "the navy accent must reach <html>").toHaveAttribute("data-accent", "navy");
  else await expect(html, "green is the base accent, so <html> names none").not.toHaveAttribute("data-accent");
  if (appearance.rail === "dark") await expect(html, "Hybrid dresses the full screen's surfaces in the rail's dark chrome").toHaveAttribute("data-rail", "dark");
  else await expect(html, `${appearance.name} keeps the rail matching the page`).not.toHaveAttribute("data-rail");
}

/**
 * A kept screenshot named for what it shows: `reach-tour-navy-hybrid-light-desktop.png` is the tour
 * in Hybrid navy. `shoot` appends the theme, so Light and Dark need no word of their own.
 */
async function shootIn(page: Page, name: string, appearance: Appearance, viewport: "desktop" | "mobile" = "desktop"): Promise<void> {
  await shoot(page, `${name}-${appearance.accent}${appearance.rail === "dark" ? "-hybrid" : ""}`, appearance.theme, viewport);
}

/** Wait until the map inside `scope` has drawn: its canvas is in, and the skeleton it shows until its land and marks are down has gone. */
async function mapReady(scope: Locator, where: string): Promise<void> {
  await expect(scope.locator(MAP_CANVAS), `${where}: the map never started (is WebGL 2 available?)`).toBeAttached({ timeout: MAP_TIMEOUT });
  await expect(scope.locator('[aria-busy="true"]'), `${where}: the map never finished its first draw`).toHaveCount(0, { timeout: MAP_TIMEOUT });
}

/**
 * Open the full screen on `query`, give the map its own long wait, then settle the page as every
 * spec does (network, landmarks, skeletons, fonts). The screen draws nothing but skeletons until it
 * has hydrated and knows the window's width, so the map's frame is the first sign it is up.
 */
async function openReach(page: Page, query = ""): Promise<void> {
  await page.goto(`/reach${query}`, { waitUntil: "domcontentloaded" });
  await mapReady(page.locator("#map"), `/reach${query}`);
  await settle(page);
}

/** The dashboard's Global reach card: the full screen's map in its preview mode. */
const reachCard = (page: Page): Locator => page.getByRole("region", { name: "Global reach", exact: true });

/** The map itself: MapLibre's canvas, a focusable region named for what it shows. */
const worldMap = (page: Page): Locator => page.getByRole("region", { name: "World map of the program's meetings", exact: true });

/** Time-driven animations running on the page, by name: what would still be moving under axe or the camera. A scroll timeline moves only with the reader. */
function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((animation) => animation.timeline === document.timeline && animation.playState === "running")
      .map((animation) => {
        const named = animation as Animation & { animationName?: string; transitionProperty?: string };
        return named.animationName ?? named.transitionProperty ?? animation.constructor.name;
      }),
  );
}

/** Wait for every slide and fade to land (a drawer, the tour's chrome, the map fading in), so axe and the camera see the page at rest. */
async function stillness(page: Page): Promise<void> {
  await expect.poll(() => runningAnimations(page), { message: "the page never came to rest", timeout: 10_000 }).toEqual([]);
}

/** Count every requestAnimationFrame call the page makes, from before its first script runs. */
async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as Window & { __rafCount?: number };
    win.__rafCount = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      win.__rafCount = (win.__rafCount ?? 0) + 1;
      return original(callback);
    };
  });
}

/** The frames the page asks for in half a second, once a second has passed for whatever it has just begun (a fade, a slide, a tile) to finish. */
async function framesIn(page: Page): Promise<number> {
  const read = () => page.evaluate(() => (window as Window & { __rafCount?: number }).__rafCount ?? 0);
  await page.waitForTimeout(1_000);
  const before = await read();
  await page.waitForTimeout(500);
  return (await read()) - before;
}

type PanelName = "Filters" | "Details";
const PANELS: PanelName[] = ["Filters", "Details"];

/** One of the full screen's two panels, an `aside` named by its title. */
const panel = (page: Page, name: PanelName): Locator => page.getByRole("complementary", { name, exact: true });

/** The tab at mid-height that stands for a tucked panel, named for it. */
const edgeTab = (page: Page, name: PanelName): Locator => page.getByRole("button", { name, exact: true });

const details = (page: Page): Locator => panel(page, "Details");

/** The rows of the Details panel's open tab: meetings under Next up, countries under Countries. */
const rows = (page: Page): Locator => details(page).getByRole("tabpanel").getByRole("button");

/** The heading of the country or meeting open in the Details panel: the country's name, or the meeting's organization. */
const viewHeading = (page: Page): Locator => details(page).getByRole("heading", { level: 3 });

/** The tour's caption card, while a tour runs. */
const tourCard = (page: Page): Locator => page.getByRole("region", { name: "Tour", exact: true });

/**
 * Choose the first country in the Countries tab (the window's busiest, whichever the seed makes it)
 * and wait until the Details panel shows it. Returns the row's name ("Japan, Asia-Pacific,
 * 3 meetings: …"), which begins with the country's own.
 */
async function chooseCountry(page: Page): Promise<string> {
  await details(page).getByRole("tab", { name: "Countries", exact: true }).click();
  const row = rows(page).first();
  await expect(row, "the Countries tab lists the window's countries").toBeVisible();
  const name = (await row.getAttribute("aria-label")) ?? "";
  await row.click();
  await expect(page, "a chosen country must reach the URL").toHaveURL(/[?&]country=[A-Z]{2}(&|$)/);
  await expect(viewHeading(page), "the Details panel must show the chosen country").toBeVisible();
  return name;
}

/** Choose the first meeting under Next up, the soonest in the window, and wait until the Details panel shows it. */
async function chooseMeeting(page: Page): Promise<void> {
  const row = rows(page).first();
  await expect(row, "Next up lists the window's meetings").toBeVisible();
  await row.click();
  await expect(page, "a chosen meeting must reach the URL").toHaveURL(/[?&]meeting=[^&]+/);
  await expect(details(page).getByRole("link", { name: "Open the meeting record" }), "the Details panel must show the chosen meeting").toBeVisible();
}

/** Start the tour from the strip, and pause it where it stands so the caption cannot move on under axe. */
async function startPausedTour(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Tour", exact: true }).click();
  const pause = tourCard(page).getByRole("button", { name: "Pause the tour" });
  await expect(pause, "the tour opens with focus on its Pause").toBeFocused();
  await pause.click();
  await expect(pause, "Pause must hold the tour on its visit").toHaveAttribute("aria-pressed", "true");
  // The caption card rises in with a fade that is not always a Web Animation; it is at rest at full strength.
  await expect(tourCard(page), "the caption card must finish arriving").toHaveCSS("opacity", "1");
}

/** Below 1280 px the panels wait behind edge tabs: open the Details one as a drawer over the map. */
async function openDetailsDrawer(page: Page): Promise<void> {
  await edgeTab(page, "Details").click();
  await expect(details(page).getByRole("button", { name: "Close Details" }), "the drawer opens with focus on its close button").toBeFocused();
}

/** A state a reader can put the full screen in, and how they get there from the page at rest. */
type ReachState = { name: string; viewport?: { width: number; height: number }; enter?: (page: Page) => Promise<unknown> };

const STATES: ReachState[] = [
  { name: "rest" },
  { name: "country", enter: chooseCountry },
  { name: "meeting", enter: chooseMeeting },
  { name: "tour", enter: startPausedTour },
  // Below 1280 px the page opens with its panels tucked, so the drawer comes from the Details edge tab.
  { name: "drawer", viewport: { width: 1100, height: 800 }, enter: openDetailsDrawer },
];

/** Tab forward from wherever focus sits until `target` has it, or say where focus went instead. */
async function tabTo(page: Page, target: Locator, limit = 20): Promise<void> {
  const trail: string[] = [];
  for (let step = 0; step < limit; step += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
    trail.push(await describeFocus(page));
  }
  throw new Error(`Never reached the target in ${limit} tabs; focus went:\n  ${trail.join("\n  ")}`);
}

/**
 * The keyboard's way onto the map from the top of the page: the skip link, which lands on the
 * map's frame past the strip and the Filters panel, then one Tab onto the canvas, where the map's
 * own keys live (the arrows, + and −, and the single-key shortcuts).
 */
async function keyboardToMap(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to the map" }), "the first tab stop must be the skip link").toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#map"), "Enter on the skip link must land focus on the map's frame").toBeFocused();
  await page.keyboard.press("Tab");
  await expect(worldMap(page), `the next Tab must reach the map itself, not ${await describeFocus(page)}`).toBeFocused();
}

/** The page's extent against the window: the full screen is a fixed frame, and only its panels scroll inside it. */
async function expectNoPageScroll(page: Page, where: string): Promise<void> {
  const { scrollWidth, scrollHeight, innerWidth, innerHeight } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  expect(scrollWidth, `${where}: the page scrolls sideways (${scrollWidth} px in a ${innerWidth} px window)`).toBeLessThanOrEqual(innerWidth);
  expect(scrollHeight, `${where}: the page scrolls down (${scrollHeight} px in a ${innerHeight} px window)`).toBeLessThanOrEqual(innerHeight);
}

test.describe("full screen · axe in every appearance and state", () => {
  for (const appearance of APPEARANCES) {
    for (const state of STATES) {
      test(`reach ${state.name} · ${appearance.name}`, async ({ page }, testInfo) => {
        if (state.viewport) await page.setViewportSize(state.viewport);
        await setAppearance(page, appearance);
        await openReach(page);
        await expectAppearance(page, appearance);
        await state.enter?.(page);
        await stillness(page);
        await shootIn(page, `reach-${state.name}`, appearance);
        await scanA11y(page, testInfo, `reach ${state.name} (${appearance.name})`);
      });
    }
  }
});

test.describe("dashboard card · axe in every appearance", () => {
  for (const appearance of APPEARANCES) {
    test(`dashboard · ${appearance.name}`, async ({ page }, testInfo) => {
      await setAppearance(page, appearance);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await mapReady(reachCard(page), "the dashboard's Global reach card");
      await settle(page);
      await expectAppearance(page, appearance);
      await shootIn(page, "dashboard-reach", appearance);
      await scanA11y(page, testInfo, `dashboard (${appearance.name})`);
    });
  }
});

test.describe("full screen · keyboard at 1440 × 900", () => {
  test("the first Tab reaches the skip link, and it takes the keyboard past the strip to the map", async ({ page }) => {
    await openReach(page);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to the map" }), "the first tab stop must be the skip link").toBeFocused();
    expect(await focusIsVisible(page), "the skip link must show a focus ring").toBe(true);

    await page.keyboard.press("Enter");
    await expect(page.locator("#map"), "Enter on the skip link must land focus on the map's frame, past the strip").toBeFocused();

    // The frame holds the canvas, and the canvas is where the map's keys live: one Tab puts the keyboard on it.
    await page.keyboard.press("Tab");
    await expect(worldMap(page), `the next Tab must reach the map itself, not ${await describeFocus(page)}`).toBeFocused();
    expect(await focusIsVisible(page), "the focused map must show its ring").toBe(true);
  });

  test("/ on the focused map puts the caret in search, with nothing typed", async ({ page }) => {
    await openReach(page);
    await keyboardToMap(page);

    await page.keyboard.press("/");
    const search = page.getByRole("combobox", { name: "Find a country or organization" });
    await expect(search, "/ on the map must reach search").toBeFocused();
    await expect(search, "the / that moved focus must not be typed into the field").toHaveValue("");
  });

  test("P tucks the panels behind their edge tabs, and P again brings them back", async ({ page }) => {
    await openReach(page);
    await keyboardToMap(page);
    for (const name of PANELS) await expect(edgeTab(page, name), `at 1440 px ${name} starts docked, with no edge tab`).toHaveCount(0);

    await page.keyboard.press("p");
    for (const name of PANELS) await expect(edgeTab(page, name), `P must tuck ${name} behind its edge tab`).toBeVisible();
    await expect(worldMap(page), "the map keeps the keyboard, so P can bring the panels back").toBeFocused();

    await page.keyboard.press("p");
    for (const name of PANELS) {
      await expect(edgeTab(page, name), `P again must take ${name}'s edge tab away`).toHaveCount(0);
      await expect(panel(page, name), `and float ${name} beside the map again`).toBeInViewport({ ratio: 1 });
    }
  });

  test("T starts the tour, and Escape ends it with focus back on Tour", async ({ page }) => {
    await openReach(page);
    await keyboardToMap(page);

    await page.keyboard.press("t");
    await expect(tourCard(page), "T on the map must start the tour").toBeVisible();
    await expect(tourCard(page).getByRole("button", { name: "Pause the tour" }), "the tour takes the keyboard to its Pause").toBeFocused();

    await page.keyboard.press("Escape");
    await expect(tourCard(page), "Escape must end the tour").toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tour", exact: true }), "and hand focus back to the Tour button").toBeFocused();
  });

  test("a country chosen in the Countries tab takes focus to its heading, and Escape goes back to the tab", async ({ page }) => {
    await openReach(page);
    await keyboardToMap(page);

    // After the map comes the Details panel, whose tab list is one stop: the tab in force.
    const nextUp = details(page).getByRole("tab", { name: "Next up", exact: true });
    const countries = details(page).getByRole("tab", { name: "Countries", exact: true });
    await tabTo(page, nextUp);
    await page.keyboard.press("ArrowRight");
    await expect(countries, "the arrow keys move along the tabs").toBeFocused();
    await page.keyboard.press("Enter");
    await expect(countries, "Enter opens the tab").toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Tab");
    const row = rows(page).first();
    await expect(row, "Tab goes on from the tabs to the first country").toBeFocused();
    const name = (await row.getAttribute("aria-label")) ?? "";
    await page.keyboard.press("Enter");

    await expect(viewHeading(page), "choosing a country must take focus to its heading").toBeFocused();
    const heading = ((await viewHeading(page).textContent()) ?? "").trim();
    expect(heading.length > 0 && name.startsWith(`${heading}, `), `the heading "${heading}" must name the country chosen ("${name}")`).toBe(true);
    await expect(page, "the chosen country must reach the URL").toHaveURL(/[?&]country=[A-Z]{2}(&|$)/);

    await page.keyboard.press("Escape");
    await expect(countries, "Escape must go back to the tabs, with focus on the one the country came from").toBeFocused();
    await expect(page, "and let the country go").not.toHaveURL(/[?&]country=/);
  });

  test("Escape on the focused map lets the chosen country go", async ({ page }) => {
    await openReach(page);
    await chooseCountry(page);

    await worldMap(page).focus();
    await page.keyboard.press("Escape");
    await expect(page, "Escape on the map must clear the selection, and the URL with it").not.toHaveURL(/[?&]country=/);
    await expect(details(page).getByRole("tab", { name: "Countries", exact: true }), "the Details panel must be back on its tabs").toHaveAttribute("aria-selected", "true");
  });
});

test.describe("full screen · widths", () => {
  test.describe("at 1440 px", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("the page never scrolls, and both panels float beside the map", async ({ page }) => {
      await setAppearance(page, NEW_READER);
      await openReach(page);
      await expectNoPageScroll(page, "1440 px");
      for (const name of PANELS) {
        await expect(panel(page, name), `${name} must float beside the map, whole`).toBeInViewport({ ratio: 1 });
        await expect(edgeTab(page, name), `docked, ${name} has no edge tab`).toHaveCount(0);
      }
      await stillness(page);
      await shootIn(page, "reach-width-1440", NEW_READER);
    });
  });

  test.describe("at 1024 px", () => {
    test.use({ viewport: { width: 1024, height: 768 } });

    test("the page never scrolls, and both panels wait behind their edge tabs", async ({ page }) => {
      await setAppearance(page, NEW_READER);
      await openReach(page);
      await expectNoPageScroll(page, "1024 px");
      for (const name of PANELS) {
        await expect(edgeTab(page, name), `under 1280 px ${name} must wait behind its edge tab`).toBeVisible();
        await expect(panel(page, name), `tucked, ${name} must be off the window`).not.toBeInViewport();
      }
      await stillness(page);
      await shootIn(page, "reach-width-1024", NEW_READER);
    });
  });

  test.describe("at 390 px", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the page never scrolls, the strip folds, and Details opens as a sheet over an inert map", async ({ page }) => {
      await setAppearance(page, NEW_READER);
      await openReach(page);
      await expectNoPageScroll(page, "390 px");

      const strip = page.getByRole("banner");
      await expect(strip.getByRole("button", { name: "More" }), "under 768 px Tour and Display & accessibility fold into More").toBeVisible();
      await expect(strip.getByRole("button", { name: "Find a country or organization" }), "and a button stands for the search field").toBeVisible();
      await expect(strip.getByRole("button", { name: "Tour", exact: true }), "the tour lives in More").toHaveCount(0);
      await expect(strip.getByRole("button", { name: "Panels" }), "and Panels is not offered: the panels stay tucked").toHaveCount(0);
      await stillness(page);
      await shootIn(page, "reach-width-390", NEW_READER, "mobile");

      await openDetailsDrawer(page);
      await expect(details(page), "the sheet must stand whole in the window").toBeInViewport({ ratio: 1 });
      const box = await details(page).boundingBox();
      expect(box?.width ?? 0, "the sheet takes the window's width, inside its 12 px edges").toBeGreaterThanOrEqual(390 - 2 * 12 - 1);
      await expect(page.locator("#map"), "the map under the sheet must be out of reach").toHaveAttribute("inert");
      await expect(page.getByRole("region", { name: "Timeline", exact: true }), "and so must the timeline").toHaveAttribute("inert");
      await expectNoPageScroll(page, "390 px with the Details sheet open");
      await stillness(page);
      await shootIn(page, "reach-width-390-sheet", NEW_READER, "mobile");
    });
  });
});

test.describe("full screen · motion", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("the signals keep the map drawing frames, and Pause the signals brings it to rest", async ({ page }) => {
    await countFrames(page);
    await openReach(page);

    const pause = page.locator("#map").getByRole("button", { name: "Pause the signals" });
    await expect(pause, "a window with visits in the next 30 days signals, and offers its pause").toHaveAttribute("aria-pressed", "false");
    const moving = await framesIn(page);

    await pause.click();
    await expect(pause, "the pause is a toggle with one name: its state is aria-pressed").toHaveAttribute("aria-pressed", "true");
    const paused = await framesIn(page);

    console.log(`[motion] requestAnimationFrame calls in 500 ms: ${moving} while the signals move, ${paused} once paused (idle budget ${IDLE_RAF_BUDGET})`);
    expect(moving, `the signals must keep the map drawing: only ${moving} frames in 500 ms`).toBeGreaterThan(IDLE_RAF_BUDGET);
    expect(paused, `paused, the map kept requesting frames (${paused} in 500 ms): an animation loop is still running`).toBeLessThanOrEqual(IDLE_RAF_BUDGET);
  });
});

test.describe("full screen · reduced motion", () => {
  // Playwright 1.62 moved the emulation flags off the top level of `use`; they live in contextOptions.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("nothing moves: the pause is withdrawn, no animation runs, and the map asks for no frames", async ({ page }) => {
    await countFrames(page);
    await openReach(page);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "the preference must reach the page").toBe(true);

    // The countries still signal, as still rings: the legend keeps their key but offers nothing to pause (WCAG 2.2.2).
    const map = page.locator("#map");
    await expect(map.getByText("Next 30 days", { exact: true }), "the window signals, so the legend keys the still rings").toBeVisible();
    await expect(map.getByRole("button", { name: "Pause the signals" }), "reduced motion should leave nothing to pause").toHaveCount(0);

    expect(await runningAnimations(page), "reduced motion must leave nothing animating on the page").toEqual([]);

    const frames = await framesIn(page);
    console.log(`[motion] requestAnimationFrame calls in 500 ms under reduced motion: ${frames} (idle budget ${IDLE_RAF_BUDGET})`);
    expect(frames, `the map kept requesting frames (${frames} in 500 ms): an animation loop is still running`).toBeLessThanOrEqual(IDLE_RAF_BUDGET);
  });
});

/** The timeline's six calendar ranges, by URL key and by the words on their buttons. */
const RANGES: [key: string, label: string][] = [
  ["all", "All"],
  ["last", "Last year"],
  ["this", "This year"],
  ["next365", "Next 365 days"],
  ["next30", "Next 30 days"],
  ["next7", "Next 7 days"],
];

/**
 * Each range lays the timeline out at its own grain (weeks, days, an agenda) and shades the map for
 * its own window. A test can say the timeline is there; only a person can say it reads well, so
 * these screenshots are kept for looking at.
 */
test.describe("full screen · every range", () => {
  for (const [key, label] of RANGES) {
    test(`range ${key}`, async ({ page }) => {
      await setAppearance(page, NEW_READER);
      await openReach(page, `?range=${key}`);

      const timeline = page.getByRole("region", { name: "Timeline", exact: true });
      await expect(timeline, "the timeline must stand under every range").toBeVisible();
      await expect(timeline.getByRole("button", { name: label, exact: true }), `${label} must be the range in force`).toHaveAttribute("aria-pressed", "true");
      await stillness(page);
      await shootIn(page, `reach-range-${key}`, NEW_READER);
    });
  }
});
