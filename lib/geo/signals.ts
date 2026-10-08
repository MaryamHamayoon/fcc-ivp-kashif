import type { CircleLayerSpecification, ExpressionSpecification } from "maplibre-gl";
import type { MeetingFormat } from "@/lib/domain/types";
import type { MapPalette } from "./map-palette";

/**
 * The signals: a country whose soonest visit is in the next 30 days carries rings in that
 * visit's format color. A virtual meeting broadcasts rings outward; an in-person visit draws
 * them inward, arriving; a hybrid does one of each. Two rings run half a cycle apart, and each
 * country starts at its own phase (`ph`), so the map breathes rather than pulsing in unison.
 * MapLibre cannot animate by itself, so each frame moves the ring clocks, kept in each
 * signaling country's feature state (`ripple`, `arrive`): MapLibre then re-evaluates only
 * those countries' ring paint. Changing a data-driven paint property instead would make it lay
 * out the whole marks source again, every frame. Stilled (paused, reduced motion, a replay),
 * each signaling mark keeps one still ring.
 */

export const VIRTUAL_CYCLE_MS = 2800;
export const IN_PERSON_CYCLE_MS = 3200;

export type SignalKind = "ripple" | "arrive";
export type SignalLayer = { id: string; kind: SignalKind; formats: MeetingFormat[]; offset: 0 | 0.5 };

/** Ripples go out for virtual and hybrid, arrivals come in for in person and hybrid: a hybrid gets one of each. */
export const SIGNAL_LAYERS: readonly SignalLayer[] = [
  { id: "ivp-arrive-a", kind: "arrive", formats: ["in_person", "hybrid"], offset: 0 },
  { id: "ivp-arrive-b", kind: "arrive", formats: ["in_person"], offset: 0.5 },
  { id: "ivp-ripple-a", kind: "ripple", formats: ["virtual", "hybrid"], offset: 0 },
  { id: "ivp-ripple-b", kind: "ripple", formats: ["virtual"], offset: 0.5 },
];

export const STILL_LAYERS = { halo: "ivp-still-halo", ring: "ivp-still" } as const;

/** Sizes on the map scale with zoom as the marks do: 72% at world zoom, 86% at zoom 3, full from zoom 5. */
export const byMarkZoom = (size: (scale: number) => number | ExpressionSpecification): ExpressionSpecification => ["interpolate", ["linear"], ["zoom"], 1, size(0.72), 3, size(0.86), 5, size(1)];

/** `byMarkZoom`'s scale as a number, for placing things beside a mark (its tooltip). */
export function markScaleAt(zoom: number): number {
  if (zoom <= 1) return 0.72;
  if (zoom <= 3) return 0.72 + ((zoom - 1) / 2) * 0.14;
  if (zoom <= 5) return 0.86 + ((zoom - 3) / 2) * 0.14;
  return 1;
}

/** The mark's radius on screen at a zoom scale: `rr` is the mark's full-size radius. */
export const markRadius = (scale: number): ExpressionSpecification => ["*", ["get", "rr"], scale];

/** The signal's color: the format of the country's soonest visit, carried as `up`. */
export const signalColor = (p: MapPalette): ExpressionSpecification => ["match", ["get", "up"], "virtual", p.virtual, "hybrid", p.hybrid, p.inPerson];

/** True for a country that signals. */
export const SIGNALING: ExpressionSpecification = ["!=", ["get", "up"], ""];

/** The ring clocks a signaling country carries in its feature state, each 0 to 1 through its cycle. */
export type SignalClock = Record<SignalKind, number>;

/** Where the clocks are at `now` (ms): a virtual cycle takes 2.8 s, an in-person one 3.2 s. */
export function signalClock(now: number): SignalClock {
  return { ripple: (now % VIRTUAL_CYCLE_MS) / VIRTUAL_CYCLE_MS, arrive: (now % IN_PERSON_CYCLE_MS) / IN_PERSON_CYCLE_MS };
}

/** Where one country's ring is in its cycle, 0 to 1: the clock, the layer's offset and the country's own phase. */
const cycle = (kind: SignalKind, offset: number): ExpressionSpecification => ["%", ["+", ["coalesce", ["feature-state", kind], 0], offset, ["get", "ph"]], 1];

/** A ring `t` of the way out, from the mark's edge to 15 px (times the mark's scale) beyond it. */
const ringAt = (t: ExpressionSpecification): ExpressionSpecification => byMarkZoom((z) => ["+", markRadius(z), 1, ["*", ["*", 15 * z + 3, ["get", "s"]], t]]);

/** One signal layer's radius and opacity; `offset` sets the second ring half a cycle behind the first. */
export function ringPaint(kind: SignalKind, offset: number): { radius: ExpressionSpecification; opacity: ExpressionSpecification } {
  const f = cycle(kind, offset);
  if (kind === "ripple") return { radius: ringAt(f), opacity: ["*", 0.8, ["^", ["-", 1, f], 1.7]] };
  return { radius: ringAt(["-", 1, f]), opacity: ["*", 0.8, ["^", ["sin", ["*", Math.PI, f]], 1.5]] };
}

export type SignalMode = "moving" | "still";
type Visibility = "visible" | "none";

/** Which layers show in a mode: the moving rings, or the still ones. */
export function signalVisibility(mode: SignalMode): [id: string, visibility: Visibility][] {
  const moving: Visibility = mode === "moving" ? "visible" : "none";
  const still: Visibility = mode === "still" ? "visible" : "none";
  return [...SIGNAL_LAYERS.map((l): [string, Visibility] => [l.id, moving]), [STILL_LAYERS.halo, still], [STILL_LAYERS.ring, still]];
}

const visibilityOf = (mode: SignalMode, id: string): Visibility => signalVisibility(mode).find(([layer]) => layer === id)?.[1] ?? "none";

/** The four moving ring layers, lying flat on the ground when the tour tilts the camera. */
export function signalLayers(p: MapPalette, mode: SignalMode, source: string): CircleLayerSpecification[] {
  return SIGNAL_LAYERS.map((layer) => {
    const { radius, opacity } = ringPaint(layer.kind, layer.offset);
    return {
      id: layer.id,
      type: "circle",
      source,
      filter: ["in", ["get", "up"], ["literal", layer.formats]],
      layout: { visibility: visibilityOf(mode, layer.id) },
      paint: {
        "circle-radius": radius,
        "circle-opacity": 0,
        "circle-stroke-width": ["+", 0.55, ["*", 0.75, ["get", "s"]]],
        "circle-stroke-color": signalColor(p),
        "circle-stroke-opacity": opacity,
        "circle-pitch-alignment": "map",
      },
    };
  });
}

/** Where the still ring sits: just outside the mark's card-colored base. */
export const STILL_GAP = 4;

/** The still ring: a format-colored ring on a card-colored halo, so it holds 3:1 over any land or water. It stays upright with its mark. */
export function stillLayers(p: MapPalette, mode: SignalMode, source: string): CircleLayerSpecification[] {
  const radius = byMarkZoom((z) => ["+", markRadius(z), STILL_GAP]);
  const ring = (id: string, width: number, color: string | ExpressionSpecification): CircleLayerSpecification => ({
    id,
    type: "circle",
    source,
    filter: SIGNALING,
    layout: { visibility: visibilityOf(mode, id) },
    paint: { "circle-radius": radius, "circle-opacity": 0, "circle-stroke-width": width, "circle-stroke-color": color },
  });
  return [ring(STILL_LAYERS.halo, 4, p.card), ring(STILL_LAYERS.ring, 1.6, signalColor(p))];
}

/** The rings stand still when the reader has paused them, prefers reduced motion, the tour is paused, or a replay is running. */
export function signalMode(o: { paused: boolean; reducedMotion: boolean; tourPaused?: boolean; replaying?: boolean }): SignalMode {
  return o.paused || o.reducedMotion || o.tourPaused || o.replaying ? "still" : "moving";
}

/** Frames are drawn only while they can be seen: moving, something signaling, the map on screen and the tab visible. */
export function shouldAnimate(o: { mode: SignalMode; signaling: boolean; onScreen: boolean; tabVisible: boolean }): boolean {
  return o.mode === "moving" && o.signaling && o.onScreen && o.tabVisible;
}

export type Ticker = { start: () => void; stop: () => void; readonly running: boolean };

/** A requestAnimationFrame loop that can be started and stopped any number of times. */
export function createTicker(frame: (now: number) => void, raf: (cb: FrameRequestCallback) => number = requestAnimationFrame, cancel: (id: number) => void = cancelAnimationFrame): Ticker {
  let id: number | null = null;
  const loop = (now: number) => {
    frame(now);
    id = raf(loop);
  };
  return {
    start() {
      if (id === null) id = raf(loop);
    },
    stop() {
      if (id !== null) cancel(id);
      id = null;
    },
    get running() {
      return id !== null;
    },
  };
}
