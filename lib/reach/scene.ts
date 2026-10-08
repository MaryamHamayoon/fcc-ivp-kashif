import { byCountry, type CountryAggregate, describeMap, type FormatMix, lens, maxCount, type ReachCountry, type ReachData, type ReachMeeting, startMs } from "@/lib/domain/reach";
import { RANGE_LABELS, type RangeKey, rangeSpan, rangeText, type Span, startOfNyDay } from "@/lib/domain/reach-time";
import type { MeetingFormat } from "@/lib/domain/types";
import { boundsOf, REGION_PAD } from "@/lib/geo/camera";
import type { CameraMove } from "@/lib/geo/reach-engine";
import type { TourFocus } from "@/lib/geo/reach-style";
import type { ReachView, Selection } from "./url";

/** A country as the full screen shows it: where it is, and what the window holds for it. It is the map's mark for that country. */
export type ScreenCountry = ReachCountry & {
  count: number;
  participants: number;
  mix: FormatMix;
  /** The format of the soonest visit on its way in the next 30 days, or null. */
  signal: MeetingFormat | null;
  /** Its meetings in the window, soonest first. */
  meetings: ReachMeeting[];
};

/** Everything the full screen shows for one view of the data, derived in one place. */
export type ReachScene = {
  /** The range's whole span. */
  range: Span;
  /** What the reader is looking at: the window they narrowed, or the whole range. */
  window: Span;
  narrowed: boolean;
  /** How the map's sentence names the window: "This year", or "Mar 1 – Mar 31, 2026" once narrowed. */
  label: string;
  /** The meetings dated in the window, through the filters. */
  list: ReachMeeting[];
  /** The window's countries, busiest first. */
  countries: ScreenCountry[];
  /** The most meetings any one country has: the top of the map's ramp. */
  max: number;
  sentence: string;
};

/** The part of `window` inside `range`, or null when that leaves nothing, or nothing narrower than the range. */
export function clampWindow(window: Span | null, range: Span): Span | null {
  if (!window) return null;
  const from = Math.max(window.from.getTime(), range.from.getTime());
  const to = Math.min(window.to.getTime(), range.to.getTime());
  if (from >= to || (from === range.from.getTime() && to === range.to.getTime())) return null;
  return { from: new Date(from), to: new Date(to) };
}

/** Each aggregate's country as the map marks it, busiest first. A country the payload does not know is left out. */
function screenCountries(aggregates: ReadonlyMap<string, CountryAggregate>, byCode: ReadonlyMap<string, ReachCountry>): ScreenCountry[] {
  const countries: ScreenCountry[] = [];
  for (const a of aggregates.values()) {
    const c = byCode.get(a.cca2);
    if (c) countries.push({ ...c, count: a.meetings.length, participants: a.participants, mix: a.mix, signal: a.signal, meetings: [...a.meetings].sort((x, y) => startMs(x) - startMs(y)) });
  }
  return countries.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** A range's whole span, from the payload alone: whatever the window, the filters or a replay. */
export function sceneRange(data: ReachData, range: RangeKey): Span {
  return rangeSpan(range, data.asOf, data.meetings.flatMap((m) => (m.start ? [m.start] : [])));
}

export function reachScene(data: ReachData, view: ReachView): ReachScene {
  const range = sceneRange(data, view.range);
  const narrowed = clampWindow(view.window, range);
  const window = narrowed ?? range;
  const list = lens(data.meetings, view.filters, window);
  const aggregates = byCountry(list, data.asOf);
  const byCode = new Map(data.countries.map((c) => [c.cca2, c]));
  const countries = screenCountries(aggregates, byCode);
  const label = narrowed ? rangeText(window) : RANGE_LABELS[view.range];
  const sentence = describeMap(label, list, aggregates, (cca2) => byCode.get(cca2)?.name ?? cca2);
  return { range, window, narrowed: narrowed !== null, label, list, countries, max: maxCount(aggregates), sentence };
}

/** The map while the tour runs: the tour's countries only, the one being told in focus, and where the camera goes. */
export type TourScene = { countries: ScreenCountry[]; focus: TourFocus | null; camera: CameraMove };

/**
 * The map while the tour runs. Only the tour's countries stay on it. The one being
 * told is in focus, drawn larger with only that visit's format, and the camera tilts in on it. The
 * summary frames all of them, flat again.
 */
export function tourScene(stops: readonly ReachMeeting[], index: number, data: ReachData): TourScene {
  const countries = screenCountries(byCountry(stops, data.asOf), new Map(data.countries.map((c) => [c.cca2, c])));
  const stop = stops[index];
  const cca2 = stop?.countries[0];
  if (stop && cca2) return { countries, focus: { cca2, format: stop.format }, camera: { kind: "tour", cca2 } };
  const bounds = boundsOf(countries, REGION_PAD);
  return { countries, focus: null, camera: bounds ? { kind: "bounds", bounds } : { kind: "world" } };
}

/** A country's soonest meeting from today on, or null when the window holds none. */
export function nextOf(country: ScreenCountry, now: Date): ReachMeeting | null {
  const today = startOfNyDay(now).getTime();
  return country.meetings.find((m) => startMs(m) >= today) ?? null;
}

/** A selection the payload can answer, else none: a deep link to a meeting this reader cannot read was never sent. */
export function knownSelection(selection: Selection, data: ReachData): Selection {
  if (selection?.kind === "country") return data.countries.some((c) => c.cca2 === selection.cca2) ? selection : null;
  if (selection?.kind === "meeting") return data.meetings.some((m) => m.id === selection.id) ? selection : null;
  return null;
}

/** The country a selection puts on the map: the country itself, or a meeting's first country. */
export function selectedCountry(selection: Selection, data: ReachData): string | null {
  if (selection?.kind === "country") return selection.cca2;
  if (selection?.kind === "meeting") return data.meetings.find((m) => m.id === selection.id)?.countries[0] ?? null;
  return null;
}

/** Where the camera goes for a region: around its countries with meetings in the window, else around every country it has ever had; the whole world for no region. */
export function regionCamera(region: string | null, scene: ReachScene, data: ReachData): CameraMove {
  if (!region) return { kind: "world" };
  const bounds = boundsOf(scene.countries.filter((c) => c.region === region), REGION_PAD) ?? boundsOf(data.countries.filter((c) => c.region === region), REGION_PAD);
  return bounds ? { kind: "bounds", bounds } : { kind: "world" };
}

/** The first framing: the selected country, else the region in the filters, else the whole world. */
export function openingCamera(view: ReachView, scene: ReachScene, data: ReachData): CameraMove {
  const cca2 = selectedCountry(view.selection, data);
  return cca2 ? { kind: "country", cca2 } : regionCamera(view.filters.region, scene, data);
}
