import {
  applyPreferences,
  applyPreset,
  DEFAULT_PREFERENCES,
  isDefaultPreferences,
  parsePreferences,
  type Preferences,
  PREFERENCES_STORAGE_KEY,
  PRESETS,
  presetMatches,
  serializePreferences,
} from "@/lib/preferences/schema";
import { PREFERENCES_BOOT_SCRIPT } from "@/lib/preferences/boot";

/** A stand-in for <html>: records what the code under test stamped on it. */
function attributeTarget() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    removeAttribute(name: string) {
      attributes.delete(name);
    },
  };
}

/**
 * The boot script runs before React exists, against nothing but `localStorage` and `document`.
 * Evaluating it with those two injected is the only honest way to test what ships in the HTML.
 */
function runBootScript(stored: string | null): Map<string, string> {
  const root = attributeTarget();
  const localStorage = { getItem: (key: string) => (key === PREFERENCES_STORAGE_KEY ? stored : null) };
  new Function("localStorage", "document", PREFERENCES_BOOT_SCRIPT)(localStorage, { documentElement: root });
  return root.attributes;
}

describe("parsePreferences", () => {
  it("returns the defaults for nothing, for garbage and for a value that is not an object", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("{not json")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("null")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences('"a string"')).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences("[1,2,3]")).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps the choices it recognises and fills the rest from the defaults", () => {
    expect(parsePreferences('{"text":"large","contrast":"high"}')).toEqual({
      ...DEFAULT_PREFERENCES,
      text: "large",
      contrast: "high",
    });
  });

  it("ignores unknown keys, unknown values and values that are not strings", () => {
    const parsed = parsePreferences('{"text":"gigantic","accent":"purple","motion":7,"font":null,"nickname":"x","surface":"tinted"}');
    expect(parsed).toEqual({ ...DEFAULT_PREFERENCES, surface: "tinted" });
    expect(parsed).not.toHaveProperty("nickname");
  });

  it("keeps the rail's style and whether it is collapsed as two separate choices", () => {
    expect(parsePreferences('{"nav":"floating","collapsed":"yes"}')).toEqual({
      ...DEFAULT_PREFERENCES,
      nav: "floating",
      collapsed: "yes",
    });
  });

  it("reads the retired icons-only style as the standard rail, collapsed", () => {
    // "compact" was a third nav style until collapse became a state of its own; a reader who
    // stored it must keep the narrow rail they chose rather than be handed the wide one.
    expect(parsePreferences('{"nav":"compact","rail":"dark"}')).toEqual({
      ...DEFAULT_PREFERENCES,
      nav: "standard",
      collapsed: "yes",
      rail: "dark",
    });
  });

  it("round-trips through serializePreferences", () => {
    const prefs: Preferences = { ...DEFAULT_PREFERENCES, accent: "navy", text: "xl", font: "legible" };
    expect(parsePreferences(serializePreferences(prefs))).toEqual(prefs);
  });

  it("knows when nothing has been changed", () => {
    expect(isDefaultPreferences(DEFAULT_PREFERENCES)).toBe(true);
    expect(isDefaultPreferences({ ...DEFAULT_PREFERENCES, contrast: "high" })).toBe(false);
  });
});

describe("applyPreferences", () => {
  it("names every choice that departs from the stylesheet's base as a data attribute", () => {
    const root = attributeTarget();
    applyPreferences(root, { ...DEFAULT_PREFERENCES, accent: "navy", text: "xl", contrast: "high", font: "legible" });

    expect(root.attributes.get("data-accent")).toBe("navy");
    expect(root.attributes.get("data-text")).toBe("xl");
    expect(root.attributes.get("data-contrast")).toBe("high");
    expect(root.attributes.get("data-font")).toBe("legible");
    // The base is an absence, never `data-surface="soft"` — the plain `:root` rules must win.
    expect(root.attributes.has("data-surface")).toBe(false);
    expect(root.attributes.has("data-motion")).toBe(false);
  });

  it("names a collapsed floating rail with both attributes, so neither choice replaces the other", () => {
    const root = attributeTarget();
    applyPreferences(root, { ...DEFAULT_PREFERENCES, nav: "floating", collapsed: "yes" });

    expect(root.attributes.get("data-nav")).toBe("floating");
    expect(root.attributes.get("data-collapsed")).toBe("yes");
  });

  it("clears an attribute when the choice goes back to the stylesheet's base", () => {
    const root = attributeTarget();
    applyPreferences(root, { ...DEFAULT_PREFERENCES, text: "large" });
    expect(root.attributes.get("data-text")).toBe("large");

    applyPreferences(root, DEFAULT_PREFERENCES);
    expect(root.attributes.has("data-text")).toBe(false);
  });

  it("gives a new reader the hybrid look and the floating rail", () => {
    // The stylesheet's base is a standard rail in the page's own tone; the default reader does
    // not get the base, so the defaults themselves have to be named on <html>.
    const root = attributeTarget();
    applyPreferences(root, parsePreferences(null));
    expect([...root.attributes]).toEqual([
      ["data-nav", "floating"],
      ["data-rail", "dark"],
    ]);
  });

  it("names nothing at all for a reader who chose the standard rail in the page's own tone", () => {
    const root = attributeTarget();
    applyPreferences(root, { ...DEFAULT_PREFERENCES, nav: "standard", rail: "match" });
    expect(root.attributes.size).toBe(0);
  });
});

describe("presets", () => {
  it("lays a preset over the defaults rather than over the current state", () => {
    const easier = PRESETS.find((preset) => preset.id === "easier-reading")!;
    expect(applyPreset(easier)).toEqual({
      ...DEFAULT_PREFERENCES,
      text: "large",
      font: "legible",
      contrast: "high",
      motion: "reduced",
    });

    const presentation = PRESETS.find((preset) => preset.id === "presentation")!;
    // Nothing of "easier reading" survives into the next preset the reader picks.
    expect(applyPreset(presentation).font).toBe("standard");
    expect(applyPreset(presentation).contrast).toBe("standard");
  });

  it("leaves the rail's layout alone — a quick setup is about reading, not where the navigation sits", () => {
    const easier = PRESETS.find((preset) => preset.id === "easier-reading")!;
    const current: Preferences = { ...DEFAULT_PREFERENCES, accent: "navy", nav: "floating", collapsed: "yes", rail: "dark" };
    expect(applyPreset(easier, current)).toEqual({
      ...DEFAULT_PREFERENCES,
      text: "large",
      font: "legible",
      contrast: "high",
      motion: "reduced",
      nav: "floating",
      collapsed: "yes",
      rail: "dark",
    });
  });

  it("every preset carries a label and one sentence about who it is for", () => {
    for (const preset of PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.endsWith(".")).toBe(true);
    }
  });
});

describe("presetMatches", () => {
  const standard = PRESETS.find((preset) => preset.id === "standard")!;
  const easier = PRESETS.find((preset) => preset.id === "easier-reading")!;

  it("is true when the whole bundle, appearance included, is what the reader is looking at", () => {
    expect(presetMatches(standard, DEFAULT_PREFERENCES, "light")).toBe(true);
    expect(presetMatches(easier, applyPreset(easier), "light")).toBe(true);
    expect(presetMatches(easier, applyPreset(easier), "dark")).toBe(true); // it names no appearance
  });

  it("ignores the rail's layout, which no preset names", () => {
    expect(presetMatches(standard, { ...DEFAULT_PREFERENCES, nav: "floating", collapsed: "yes", rail: "dark" }, "light")).toBe(true);
  });

  it("is false when a single choice differs, or when the appearance it names does not match", () => {
    expect(presetMatches(standard, { ...DEFAULT_PREFERENCES, accent: "navy" }, "light")).toBe(false);
    expect(presetMatches(standard, DEFAULT_PREFERENCES, "dark")).toBe(false);
    expect(presetMatches(easier, { ...applyPreset(easier), motion: "system" }, "light")).toBe(false);
  });
});

describe("PREFERENCES_BOOT_SCRIPT", () => {
  it("stamps only the choices that differ from the stylesheet's base", () => {
    const attributes = runBootScript('{"text":"large","accent":"green","font":"legible","nav":"standard","rail":"match"}');
    expect([...attributes]).toEqual([
      ["data-text", "large"],
      ["data-font", "legible"],
    ]);
  });

  it("paints a first-time reader, with nothing stored, in the default hybrid look with a floating rail", () => {
    const defaults = [
      ["data-nav", "floating"],
      ["data-rail", "dark"],
    ];
    expect([...runBootScript(null)]).toEqual(defaults);
    expect([...runBootScript("")]).toEqual(defaults);
  });

  it("stamps the rail's style, fold and tone like any other choice, so the first frame has the right rail", () => {
    expect([...runBootScript('{"nav":"floating","collapsed":"yes","rail":"dark"}')]).toEqual([
      ["data-nav", "floating"],
      ["data-collapsed", "yes"],
      ["data-rail", "dark"],
    ]);
  });

  it("paints the retired icons-only style as a collapsed standard rail, with no wide rail flashing by first", () => {
    expect([...runBootScript('{"nav":"compact","rail":"match"}')]).toEqual([["data-collapsed", "yes"]]);
  });

  it("falls back to the default look, never to an error, when what is stored is unusable", () => {
    const defaults = [
      ["data-nav", "floating"],
      ["data-rail", "dark"],
    ];
    expect([...runBootScript("{oops")]).toEqual(defaults);
    expect([...runBootScript("null")]).toEqual(defaults);
    expect([...runBootScript('"a string"')]).toEqual(defaults);
  });

  it("skips values it does not recognise instead of stamping them", () => {
    const attributes = runBootScript('{"text":"gigantic","contrast":"high","nickname":"x","nav":"standard","rail":"match"}');
    expect([...attributes]).toEqual([["data-contrast", "high"]]);
  });
});
