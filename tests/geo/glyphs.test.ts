// @vitest-environment node
import { type GlyphContext, glyphColors, glyphGeometry, glyphKey, glyphRadius, glyphSlices, paintGlyph, parseGlyphKey } from "@/lib/geo/glyphs";
import { MAP_PALETTES } from "@/lib/geo/map-palette";

const mix = (in_person: number, hybrid: number, virtual: number) => ({ in_person, hybrid, virtual });
const QUARTER = Math.PI / 2;

describe("size and key", () => {
  it("grows with the square root of the count", () => {
    expect(glyphRadius(1)).toBe(6.5);
    expect(glyphRadius(5)).toBeCloseTo(11.3, 10);
    expect(glyphRadius(0)).toBe(6.5);
  });

  it("names each mix, size and palette-free shape once", () => {
    expect(glyphKey(mix(2, 1, 0), 1)).toBe("g:2:1:0:1");
    expect(glyphKey(mix(0, 0, 1), 1.7)).toBe("g:0:0:1:1.7");
    expect(parseGlyphKey("g:2:1:0:1.7")).toEqual({ mix: mix(2, 1, 0), scale: 1.7 });
    expect(parseGlyphKey("capital")).toBeNull();
    expect(parseGlyphKey("g:x:1:0:1")).toBeNull();
  });
});

describe("slices", () => {
  it("runs clockwise from twelve o'clock, in person first, then hybrid, then virtual", () => {
    const slices = glyphSlices(mix(2, 1, 1));
    expect(slices.map((s) => s.format)).toEqual(["in_person", "in_person", "hybrid", "virtual"]);
    expect(slices[0]).toEqual({ format: "in_person", start: -QUARTER, end: 0 });
    expect(slices[3]?.end).toBeCloseTo(1.5 * Math.PI, 10);
  });

  it("switches to one sector per format, sized by share, past 12 meetings", () => {
    expect(glyphSlices(mix(12, 0, 0))).toHaveLength(12);
    const sectors = glyphSlices(mix(10, 0, 5));
    expect(sectors.map((s) => s.format)).toEqual(["in_person", "virtual"]);
    expect(sectors[0]!.end - sectors[0]!.start).toBeCloseTo((2 * Math.PI * 10) / 15, 10);
    expect(sectors[1]!.end).toBeCloseTo(1.5 * Math.PI, 10);
  });

  it("has no slices for no meetings", () => {
    expect(glyphSlices(mix(0, 0, 0))).toEqual([]);
  });
});

describe("geometry", () => {
  it("sizes the image around the mark, its rim and its hybrid core", () => {
    const g = glyphGeometry(mix(1, 0, 0), 1);
    expect(g.radius).toBe(6.5);
    expect(g.size).toBe(21); // ceil(2 × (6.5 + 4))
    expect(g.center).toBe(10.5);
    expect(g.rim).toBe(2); // never thinner than 2 px
    expect(g.core).toBeCloseTo(2.99, 10);
    expect(g.separators).toEqual([]);
    const big = glyphGeometry(mix(10, 0, 0), 1.7);
    expect(big.radius).toBeCloseTo(glyphRadius(10) * 1.7, 10);
    expect(big.rim).toBeCloseTo(big.radius * 0.2, 10);
    expect(big.separators).toHaveLength(10);
  });
});

describe("painting", () => {
  /** A canvas that writes down what it was asked to draw. */
  function recorder() {
    const ops: string[] = [];
    const ctx = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      shadowColor: "",
      shadowBlur: 0,
      shadowOffsetY: 0,
      save: () => ops.push("save"),
      restore: () => ops.push("restore"),
      scale: (x: number) => ops.push(`scale ${x}`),
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      arc: (_x: number, _y: number, r: number) => ops.push(`arc ${r.toFixed(2)}`),
      fill: () => ops.push(`fill ${ctx.fillStyle}`),
      stroke: () => ops.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth.toFixed(2)}`),
    };
    return { ctx: ctx as unknown as GlyphContext, ops };
  }
  const colors = glyphColors(MAP_PALETTES["light-green-standard"]);

  it("fills in person to the rim, hybrid to its core, and leaves virtual open", () => {
    const { ctx, ops } = recorder();
    paintGlyph(ctx, glyphGeometry(mix(1, 1, 1), 1), colors, 2);
    const r = glyphRadius(3);
    expect(ops.slice(0, 5)).toEqual(["scale 2", "save", `arc ${(r + 1.6).toFixed(2)}`, "fill #ffffff", "restore"]);
    expect(ops).toContain(`fill ${colors.in_person}`);
    expect(ops).toContain(`arc ${(r * 0.46).toFixed(2)}`);
    expect(ops).toContain(`fill ${colors.hybrid}`);
    expect(ops).not.toContain(`fill ${colors.virtual}`);
    expect(ops).toContain(`stroke ${colors.virtual} ${Math.max(2, r * 0.2).toFixed(2)}`);
    // three card-colored separators between the slices
    expect(ops.filter((op) => op.startsWith(`stroke ${colors.card}`))).toHaveLength(3);
  });

  it("draws no separator for a single meeting", () => {
    const { ctx, ops } = recorder();
    paintGlyph(ctx, glyphGeometry(mix(0, 0, 1), 1), colors, 2);
    expect(ops.filter((op) => op.startsWith(`stroke ${colors.card}`))).toHaveLength(0);
  });
});
