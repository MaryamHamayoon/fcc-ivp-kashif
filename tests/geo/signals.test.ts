// @vitest-environment node
import { MAP_PALETTES } from "@/lib/geo/map-palette";
import {
  byMarkZoom,
  createTicker,
  IN_PERSON_CYCLE_MS,
  markScaleAt,
  ringPaint,
  SIGNAL_LAYERS,
  STILL_LAYERS,
  shouldAnimate,
  signalClock,
  signalLayers,
  signalMode,
  signalVisibility,
  stillLayers,
  VIRTUAL_CYCLE_MS,
} from "@/lib/geo/signals";
import { evaluate, matches, rgba } from "@/tests/fixtures/style";

const p = MAP_PALETTES["light-green-standard"];
/** A full-size mark of radius 10 whose own phase is `ph`. */
const mark = (ph = 0) => ({ rr: 10, s: 1, ph });

describe("which rings a country gets", () => {
  const ringsFor = (up: string) => [...signalLayers(p, "moving", "marks"), ...stillLayers(p, "still", "marks")].filter((l) => matches(l.filter, { up })).map((l) => l.id);

  it("broadcasts two rings out for a virtual meeting, draws two in for a visit, and one of each for hybrid", () => {
    expect(ringsFor("virtual")).toEqual(["ivp-ripple-a", "ivp-ripple-b", STILL_LAYERS.halo, STILL_LAYERS.ring]);
    expect(ringsFor("in_person")).toEqual(["ivp-arrive-a", "ivp-arrive-b", STILL_LAYERS.halo, STILL_LAYERS.ring]);
    expect(ringsFor("hybrid")).toEqual(["ivp-arrive-a", "ivp-ripple-a", STILL_LAYERS.halo, STILL_LAYERS.ring]);
    expect(ringsFor("")).toEqual([]);
  });

  it("draws each ring in the signaling visit's format color, flat on the ground", () => {
    const color = signalLayers(p, "moving", "marks")[0]?.paint?.["circle-stroke-color"];
    expect(evaluate("circle", "paint", "circle-stroke-color", color, { zoom: 3, properties: { up: "virtual" } })).toBe(rgba(p.virtual));
    expect(evaluate("circle", "paint", "circle-stroke-color", color, { zoom: 3, properties: { up: "hybrid" } })).toBe(rgba(p.hybrid));
    expect(evaluate("circle", "paint", "circle-stroke-color", color, { zoom: 3, properties: { up: "in_person" } })).toBe(rgba(p.inPerson));
    for (const l of signalLayers(p, "moving", "marks")) expect(l.paint?.["circle-pitch-alignment"]).toBe("map");
  });
});

describe("a ring's journey", () => {
  /** A ring of `kind` with the country's clock at `t`: the clock lives in the country's feature state. */
  const at = (kind: "ripple" | "arrive", t: number, zoom = 5, ph = 0, offset = 0) => {
    const { radius, opacity } = ringPaint(kind, offset);
    const where = { zoom, properties: mark(ph), state: { [kind]: t } };
    return {
      radius: evaluate("circle", "paint", "circle-radius", radius, where) as number,
      opacity: evaluate("circle", "paint", "circle-stroke-opacity", opacity, where) as number,
    };
  };

  it("ripples out from the mark's edge, fading as it grows", () => {
    expect(at("ripple", 0)).toEqual({ radius: 11, opacity: 0.8 });
    expect(at("ripple", 0.5).radius).toBeCloseTo(20, 10); // 11 + 18 × 0.5
    expect(at("ripple", 0.5).opacity).toBeCloseTo(0.8 * 0.5 ** 1.7, 10);
    expect(at("ripple", 0.999).opacity).toBeLessThan(0.001);
  });

  it("arrives from 18 px out, easing in and out of sight", () => {
    expect(at("arrive", 0)).toEqual({ radius: 29, opacity: 0 });
    expect(at("arrive", 0.5).radius).toBeCloseTo(20, 10);
    expect(at("arrive", 0.5).opacity).toBeCloseTo(0.8, 10);
    expect(at("arrive", 0.75).radius).toBeCloseTo(15.5, 10);
  });

  it("knows the marks' zoom scale as a number too, agreeing with the expression", () => {
    const scale = byMarkZoom((z) => z);
    for (const zoom of [0, 1, 2, 3, 4.5, 5, 6]) expect(markScaleAt(zoom)).toBeCloseTo(evaluate("circle", "paint", "circle-radius", scale, { zoom }) as number, 10);
  });

  it("scales with zoom like the marks, and starts at the country's own phase", () => {
    expect(at("ripple", 0.5, 1).radius).toBeCloseTo(10 * 0.72 + 1 + (15 * 0.72 + 3) * 0.5, 10);
    expect(at("ripple", 0.25, 5, 0.25).radius).toBeCloseTo(at("ripple", 0.5).radius, 10);
  });

  it("runs the second ring of a layer pair half a cycle behind the first", () => {
    const [first, second] = SIGNAL_LAYERS.filter((l) => l.kind === "ripple");
    expect([first?.offset, second?.offset]).toEqual([0, 0.5]);
    expect(at("ripple", 0.1, 5, 0, 0.5).radius).toBeCloseTo(at("ripple", 0.6).radius, 10);
  });

  it("reads a clock that has not been set yet as the start of the cycle", () => {
    const { radius } = ringPaint("ripple", 0);
    expect(evaluate("circle", "paint", "circle-radius", radius, { zoom: 5, properties: mark() })).toBe(11);
  });

  it("keeps a 2.8 s clock for virtual rings and a 3.2 s one for in-person rings", () => {
    expect([VIRTUAL_CYCLE_MS, IN_PERSON_CYCLE_MS]).toEqual([2800, 3200]);
    expect(signalClock(0)).toEqual({ ripple: 0, arrive: 0 });
    expect(signalClock(1400).ripple).toBe(0.5);
    expect(signalClock(1600).arrive).toBe(0.5);
    expect(signalClock(3 * VIRTUAL_CYCLE_MS + 700).ripple).toBe(0.25);
  });
});

describe("still rings", () => {
  it("replace the moving rings when the signals stand still", () => {
    expect(signalVisibility("moving")).toEqual([
      ["ivp-arrive-a", "visible"],
      ["ivp-arrive-b", "visible"],
      ["ivp-ripple-a", "visible"],
      ["ivp-ripple-b", "visible"],
      [STILL_LAYERS.halo, "none"],
      [STILL_LAYERS.ring, "none"],
    ]);
    expect(signalLayers(p, "still", "marks").every((l) => l.layout?.visibility === "none")).toBe(true);
    expect(stillLayers(p, "still", "marks").every((l) => l.layout?.visibility === "visible")).toBe(true);
    expect(stillLayers(p, "moving", "marks").every((l) => l.layout?.visibility === "none")).toBe(true);
  });

  it("sit at the mark's edge: a 1.6 px ring in the format color on a 4 px card-colored halo", () => {
    const [halo, ring] = stillLayers(p, "still", "marks");
    expect(evaluate("circle", "paint", "circle-radius", ring?.paint?.["circle-radius"], { zoom: 5, properties: mark() })).toBe(14);
    expect(halo?.paint).toMatchObject({ "circle-stroke-width": 4, "circle-stroke-color": p.card });
    expect(ring?.paint?.["circle-stroke-width"]).toBe(1.6);
    expect(evaluate("circle", "paint", "circle-stroke-color", ring?.paint?.["circle-stroke-color"], { zoom: 5, properties: { up: "virtual" } })).toBe(rgba(p.virtual));
  });
});

describe("when the rings move", () => {
  it("stands still when paused, under reduced motion, while the tour is paused, and during a replay", () => {
    expect(signalMode({ paused: false, reducedMotion: false })).toBe("moving");
    expect(signalMode({ paused: true, reducedMotion: false })).toBe("still");
    expect(signalMode({ paused: false, reducedMotion: true })).toBe("still");
    expect(signalMode({ paused: false, reducedMotion: false, tourPaused: true })).toBe("still");
    expect(signalMode({ paused: false, reducedMotion: false, replaying: true })).toBe("still");
  });

  it("draws frames only while the map is on screen, the tab is visible and something signals", () => {
    const live = { mode: "moving" as const, signaling: true, onScreen: true, tabVisible: true };
    expect(shouldAnimate(live)).toBe(true);
    expect(shouldAnimate({ ...live, mode: "still" })).toBe(false);
    expect(shouldAnimate({ ...live, signaling: false })).toBe(false);
    expect(shouldAnimate({ ...live, onScreen: false })).toBe(false);
    expect(shouldAnimate({ ...live, tabVisible: false })).toBe(false);
  });

  it("ticks once per frame until stopped, and starting twice runs one loop", () => {
    const queue: FrameRequestCallback[] = [];
    const cancel = vi.fn();
    const frames: number[] = [];
    const ticker = createTicker((now) => frames.push(now), (cb) => queue.push(cb), cancel);
    expect(ticker.running).toBe(false);
    ticker.start();
    ticker.start();
    expect(queue).toHaveLength(1);
    queue.shift()?.(16);
    queue.shift()?.(33);
    expect(frames).toEqual([16, 33]);
    expect(ticker.running).toBe(true);
    ticker.stop();
    expect(cancel).toHaveBeenCalledOnce();
    expect(ticker.running).toBe(false);
  });
});
