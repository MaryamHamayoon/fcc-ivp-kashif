// @vitest-environment node
import atlas from "world-atlas/countries-50m.json";
import { loadShapes, type Shapes, shapesFromTopology, unwrapRing } from "@/lib/geo/shapes";

let shapes: Shapes;
beforeAll(() => {
  shapes = shapesFromTopology(atlas as unknown as Parameters<typeof shapesFromTopology>[0]);
});

describe("unwrapRing", () => {
  it("moves a ring that crosses the antimeridian east of 180 degrees", () => {
    const ring = [
      [179, -16],
      [-179, -16],
      [-179, -17],
      [179, -17],
      [179, -16],
    ];
    expect(unwrapRing(ring)).toEqual([
      [179, -16],
      [181, -16],
      [181, -17],
      [179, -17],
      [179, -16],
    ]);
  });

  it("leaves every other ring alone", () => {
    const ring = [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 10],
    ];
    expect(unwrapRing(ring)).toBe(ring);
  });
});

describe("the 1:50m shapes", () => {
  it("drops Antarctica and keys every shape by its numeric ISO code", () => {
    expect(shapes.collection.features.length).toBeGreaterThan(200);
    expect(shapes.collection.features.some((f) => f.properties.ccn3 === "010")).toBe(false);
    const japan = shapes.collection.features.find((f) => f.properties.ccn3 === "392");
    expect(japan?.id).toBe(392);
    expect(japan?.properties.id).toBe(392);
  });

  it("keeps Fiji and Russia whole across the antimeridian", () => {
    const [[fijiWest], [fijiEast]] = shapes.bounds.get("242")!;
    expect(fijiWest).toBeGreaterThan(170);
    expect(fijiEast).toBeLessThan(185);
    const russia = shapes.collection.features.find((f) => f.properties.ccn3 === "643")!;
    const rings = russia.geometry.type === "MultiPolygon" ? russia.geometry.coordinates.flat() : russia.geometry.coordinates;
    const longitudes = rings.flat().map(([lng = 0]) => lng);
    expect(Math.min(...longitudes)).toBeGreaterThan(-20); // Chukotka runs east past 180°, not round to 170° W
    expect(Math.max(...longitudes)).toBeGreaterThan(180);
  });

  it("frames a country by its largest landmass", () => {
    const [[franceWest]] = shapes.bounds.get("250")!;
    expect(franceWest).toBeGreaterThan(-6); // metropolitan France, not French Guiana at 54° W
    const [[usWest, usSouth], [usEast, usNorth]] = shapes.bounds.get("840")!;
    expect(usWest).toBeGreaterThan(-126); // the lower 48, not Alaska
    expect(usEast).toBeLessThan(-66);
    expect(usSouth).toBeGreaterThan(24);
    expect(usNorth).toBeLessThan(50);
  });

  it("loads once and shares the result", async () => {
    const first = loadShapes();
    expect(loadShapes()).toBe(first);
    expect((await first).collection.features.length).toBe(shapes.collection.features.length);
  });
});
