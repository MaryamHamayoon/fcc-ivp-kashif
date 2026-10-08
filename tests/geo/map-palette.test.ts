// @vitest-environment node
import { lab } from "d3-color";
import { CLEAR_OF_WATER, GLASS_OPACITY, MAP_PALETTES, MAP_TOKENS, type MapPalette, type PaletteColor, type PaletteKey, paletteKey, ramp, readFontFamily, readMapPalette, samePalette, type StyleReader } from "@/lib/geo/map-palette";
import { contrast, cssTokens, luminance, over } from "@/tests/fixtures/tokens";

const KEYS = Object.keys(MAP_PALETTES) as PaletteKey[];

/** A stand-in for `documentElement` plus `getComputedStyle`, with no DOM in sight. */
function fakeRoot(attributes: Record<string, string>, tokens: Record<string, string>) {
  const root = { getAttribute: (name: string) => attributes[name] ?? null } as unknown as Element;
  const read = (): StyleReader => ({ getPropertyValue: (name: string) => tokens[name] ?? "" });
  return { root, read };
}

describe("reading the palette", () => {
  it("picks the palette the document's preferences select, with Hybrid on the light map", () => {
    expect(paletteKey(fakeRoot({}, {}).root)).toBe("light-green-standard");
    expect(paletteKey(fakeRoot({ "data-theme": "dark", "data-accent": "navy", "data-contrast": "high" }, {}).root)).toBe("dark-navy-high");
    expect(paletteKey(fakeRoot({ "data-theme": "light", "data-rail": "dark" }, {}).root)).toBe("light-green-standard");
  });

  it("reads the live tokens and keeps a fallback for any the document does not answer", () => {
    const { root, read } = fakeRoot({ "data-theme": "dark" }, { "--map-water": " #010203 ", "--chart-2": "#aa7700" });
    const p = readMapPalette(root, read);
    expect(p.key).toBe("dark-green-standard");
    expect(p.dark).toBe(true);
    expect(p.water).toBe("#010203");
    expect(p.inPerson).toBe("#aa7700");
    expect(p.land).toBe(MAP_PALETTES["dark-green-standard"].land);
    expect(readMapPalette(null)).toEqual(MAP_PALETTES["light-green-standard"]);
    expect(samePalette(p, { ...p })).toBe(true);
    expect(samePalette(p, { ...p, land: "#000000" })).toBe(false);
  });

  it("names the interface typeface, whichever the reader has chosen", () => {
    const standard = fakeRoot({}, { "--font-ui": `"Public Sans", "Public Sans Fallback"` });
    expect(readFontFamily(standard.root, standard.read)).toBe("Public Sans");
    const legible = fakeRoot({}, { "--font-ui": "'Atkinson Hyperlegible', 'Atkinson Hyperlegible Fallback'" });
    expect(readFontFamily(legible.root, legible.read)).toBe("Atkinson Hyperlegible");
    expect(readFontFamily(null)).toBe("Public Sans");
  });
});

describe("the choropleth ramp", () => {
  const p = MAP_PALETTES["light-green-standard"];

  it("steps by count up to the window's maximum, in at most four fills", () => {
    const r = ramp(p, 9);
    expect(r.colors).toHaveLength(4);
    expect(r.thresholds).toEqual([1, 4, 6, 8]);
    expect([r.min, r.max]).toEqual([1, 9]);
    expect(new Set(r.colors).size).toBe(4);
    expect(r.colors.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    // lightest first, and never the land itself
    expect(r.colors.map(luminance)).toEqual([...r.colors.map(luminance)].sort((a, b) => b - a));
    expect(r.colors).not.toContain(p.land);
  });

  it("uses fewer steps when the counts are small, and one midway step for a single meeting", () => {
    expect(ramp(p, 2).thresholds).toEqual([1, 2]);
    expect(ramp(p, 1).colors).toHaveLength(1);
    expect(ramp(p, 1).colors[0]).not.toBe(ramp(p, 4).colors[0]);
    expect(ramp(p, 0)).toMatchObject({ min: 0, max: 0 });
  });
});

describe.each(KEYS)("the %s palette", (key) => {
  const tokens = cssTokens(key);
  const p: MapPalette = MAP_PALETTES[key];

  it("matches app/globals.css exactly", () => {
    for (const field of Object.keys(MAP_TOKENS) as PaletteColor[]) expect([field, p[field]]).toEqual([field, tokens[MAP_TOKENS[field]]]);
  });

  it("holds every label at 4.5:1 on the ground it sits on", () => {
    const pairs: [string, string, string][] = [
      ["country labels on land", p.label, p.land],
      ["country labels on water", p.label, p.water],
      ["country labels on quieter land", p.label, p.land2],
      ["country labels on forest", p.label, p.forest],
      ["country labels on towns", p.label, p.urban],
      ["capitals on land", p.labelCity, p.land],
      ["ocean labels on water", p.oceanLabel, p.water],
    ];
    for (const [what, fg, bg] of pairs) expect(contrast(fg, bg), what).toBeGreaterThanOrEqual(4.5);
  });

  it("holds every glyph part at 3:1 on the card-colored disc under it", () => {
    for (const [what, c] of [["in person", p.inPerson], ["hybrid", p.hybrid], ["virtual", p.virtual]] as const) expect(contrast(c, p.card), what).toBeGreaterThanOrEqual(3);
  });

  it("never shades a country the water's color: every step stands clear of the sea, and of the step before it", () => {
    const steps = ramp(p, 4).colors.map((c) => lab(c).l);
    // Rounding to hex moves a step's lightness by well under half a unit.
    expect(Math.abs(steps[0]! - lab(p.water).l)).toBeGreaterThanOrEqual(CLEAR_OF_WATER - 0.5);
    for (let k = 1; k < steps.length; k++) expect(Math.abs(steps[k]! - steps[k - 1]!), `step ${k}`).toBeGreaterThanOrEqual(6);
  });
});

describe("the full screen's glass", () => {
  // Chrome over map: Light and Dark keep one palette; Hybrid puts dark chrome over the light map.
  const CASES: [string, PaletteKey, PaletteKey][] = [
    ["light · green", "light-green-standard", "light-green-standard"],
    ["dark · green", "dark-green-standard", "dark-green-standard"],
    ["hybrid · green", "dark-green-standard", "light-green-standard"],
    ["light · navy", "light-navy-standard", "light-navy-standard"],
    ["dark · navy", "dark-navy-standard", "dark-navy-standard"],
    ["hybrid · navy", "dark-navy-standard", "light-navy-standard"],
  ];

  it.each(CASES)("keeps muted text at 4.5:1 over the worst the map can put behind it (%s)", (_, chromeKey, mapKey) => {
    const chrome = cssTokens(chromeKey);
    const card = chrome["--card"] ?? "";
    const muted = chrome["--muted-foreground"] ?? "";
    const darkChrome = chromeKey.startsWith("dark");
    const map = MAP_PALETTES[mapKey];
    const behind = (Object.keys(MAP_TOKENS) as PaletteColor[]).map((field) => map[field]);
    // Light glass fears the darkest thing under it; dark glass the brightest.
    const worst = behind.reduce((a, b) => ((darkChrome ? luminance(b) > luminance(a) : luminance(b) < luminance(a)) ? b : a));
    const glass = over(card, darkChrome ? GLASS_OPACITY.dark : GLASS_OPACITY.light, worst);
    expect(contrast(muted, glass)).toBeGreaterThanOrEqual(4.5);
  });
});
