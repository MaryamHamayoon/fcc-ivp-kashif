// @vitest-environment node
import { boundsOf, constrainCamera, fitCamera, NO_PADDING, WORLD_BOUNDS, ZOOM_MIN } from "@/lib/geo/camera";

const SCREEN = { width: 1440, height: 900 };
const FLOATING = { top: 76, left: 320, right: 392, bottom: 196 };

describe("fitCamera", () => {
  it("frames the world into the space the panels leave, and carries the padding with it", () => {
    const cam = fitCamera(WORLD_BOUNDS, SCREEN, FLOATING);
    expect(cam.padding).toBe(FLOATING);
    expect(cam.bearing).toBe(0);
    expect(cam.center[0]).toBeCloseTo(13, 5); // halfway between 122° W and 148° E
    expect(cam.center[1]).toBeCloseTo(17.2, 1);
    // 696 px of free width for 270° of longitude: 2^z = 696 / (0.75 × 512)
    expect(cam.zoom).toBeCloseTo(Math.log2(696 / 384), 5);
  });

  it("zooms further when the panels are tucked away", () => {
    const tucked = fitCamera(WORLD_BOUNDS, SCREEN, { top: 76, left: 84, right: 84, bottom: 88 });
    expect(tucked.zoom).toBeGreaterThan(fitCamera(WORLD_BOUNDS, SCREEN, FLOATING).zoom);
  });

  it("never zooms past the cap or out past the world", () => {
    const tiny: [[number, number], [number, number]] = [
      [4, 50],
      [4.5, 50.5],
    ];
    expect(fitCamera(tiny, SCREEN, NO_PADDING).zoom).toBe(5);
    expect(fitCamera(tiny, SCREEN, NO_PADDING, { maxZoom: 4 }).zoom).toBe(4);
    expect(fitCamera(WORLD_BOUNDS, { width: 300, height: 200 }, NO_PADDING).zoom).toBe(ZOOM_MIN);
    expect(fitCamera(WORLD_BOUNDS, { width: 0, height: 0 }, FLOATING).zoom).toBe(ZOOM_MIN); // not measured yet
  });

  it("centers a frame that crosses the antimeridian on the date line, not on Greenwich", () => {
    const fiji = fitCamera(
      [
        [177, -21],
        [182, -12],
      ],
      SCREEN,
    );
    expect(fiji.center[0]).toBeCloseTo(179.5, 5);
    const pacific = fitCamera(
      [
        [170, -20],
        [200, 0],
      ],
      SCREEN,
    );
    expect(pacific.center[0]).toBeCloseTo(-175, 5);
  });
});

describe("boundsOf", () => {
  it("boxes a set of places, padded", () => {
    expect(
      boundsOf(
        [
          { lng: -80, lat: 10 },
          { lng: 30, lat: 50 },
        ],
        6,
      ),
    ).toEqual([
      [-86, 4],
      [36, 56],
    ]);
    expect(boundsOf([])).toBeNull();
  });

  it("runs east past 180 degrees rather than around the world", () => {
    expect(
      boundsOf([
        { lng: 178.4, lat: -18.1 },
        { lng: -171.8, lat: -13.8 },
      ]),
    ).toEqual([
      [178.4, -18.1],
      [188.2, -13.8],
    ]);
  });
});

describe("constrainCamera", () => {
  it("keeps one world, no poles, and the zoom range", () => {
    expect(constrainCamera(200, 88, 9)).toEqual({ lng: 180, lat: 76, zoom: 6 });
    expect(constrainCamera(-200, -80, 0)).toEqual({ lng: -180, lat: -62, zoom: 0.6 });
    expect(constrainCamera(10, 20, 3)).toEqual({ lng: 10, lat: 20, zoom: 3 });
  });
});
