// @vitest-environment node
import { GLASS_OPACITY } from "@/lib/geo/map-palette";
import { GLOBALS_CSS } from "@/tests/fixtures/tokens";

/** The `--glass-mix` declared by the rule that ends with this selector, as a fraction. */
function mixFor(selector: string): number | null {
  const at = GLOBALS_CSS.indexOf(`${selector} {`);
  if (at < 0) return null;
  const match = /--glass-mix:\s*(\d+)%/.exec(GLOBALS_CSS.slice(at, GLOBALS_CSS.indexOf("}", at)));
  return match ? Number(match[1]) / 100 : null;
}

describe("the full screen's glass", () => {
  it("mixes the card color at the opacities whose contrast the map palette proves", () => {
    expect(mixFor(".glass")).toBe(GLASS_OPACITY.light);
    // One rule for the dark theme and for Hybrid's dark chrome over the light map.
    expect(mixFor(':where(:root[data-rail="dark"]:not([data-theme="dark"])) .glass[data-rail-surface]')).toBe(GLASS_OPACITY.dark);
  });

  it("turns solid under high contrast, and when the reader asks for less transparency", () => {
    expect(mixFor(':root[data-contrast="high"] .glass')).toBe(1);
    expect(GLOBALS_CSS).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*:root \.glass \{\s*--glass-mix: 100%;/);
  });
});
