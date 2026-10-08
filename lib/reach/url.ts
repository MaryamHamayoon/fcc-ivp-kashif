import { nyDate, nyParts } from "@/lib/domain/fiscal-year";
import { FORMAT_ORDER, NO_FILTERS, type ReachFilters } from "@/lib/domain/reach";
import { addNyDays, isRangeKey, type RangeKey, type Span } from "@/lib/domain/reach-time";
import { MEETING_STATUSES, type MeetingFormat, type MeetingStatus } from "@/lib/domain/types";

/**
 * The full screen's view is its URL: range, window, filters, the chosen country or meeting, and
 * the Details tab. Parsing is forgiving (anything it cannot use falls back to the default), and
 * serializing is canonical (a fixed key order, defaults left out except the range), so a link
 * reads the same however the view was reached. The dashboard card writes the same shape.
 */

export type DetailsTab = "next" | "countries";
export type Selection = { kind: "country"; cca2: string } | { kind: "meeting"; id: string } | null;

export type ReachView = {
  range: RangeKey;
  /** A narrower window inside the range, its end exclusive; null is the whole range. */
  window: Span | null;
  filters: ReachFilters;
  selection: Selection;
  tab: DetailsTab;
};

export const DEFAULT_VIEW: ReachView = { range: "this", window: null, filters: NO_FILTERS, selection: null, tab: "next" };

const pad = (n: number) => String(n).padStart(2, "0");

/** A Washington day as the URL writes it: "2026-10-01". */
export function dayKey(d: Date): string {
  const { year, month, day } = nyParts(d);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** The Washington midnight a day key names, or null for anything that is not a real day. */
export function parseDayKey(value: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = nyDate(year, month, day);
  const back = nyParts(date);
  return back.year === year && back.month === month && back.day === day ? date : null;
}

const text = (params: URLSearchParams, key: string): string | null => params.get(key)?.trim() || null;

/** Values from a repeatable key that belong to `allowed`, once each, in `allowed`'s order. */
function members<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T[] {
  const given = new Set(params.getAll(key));
  return allowed.filter((value) => given.has(value));
}

export function parseReachView(params: URLSearchParams): ReachView {
  const range = params.get("range");
  const first = parseDayKey(params.get("from"));
  const last = parseDayKey(params.get("to"));
  const meeting = text(params, "meeting");
  const country = text(params, "country")?.toUpperCase() ?? null;
  return {
    range: isRangeKey(range) ? range : DEFAULT_VIEW.range,
    window: first && last && first.getTime() <= last.getTime() ? { from: first, to: addNyDays(last, 1) } : null,
    filters: {
      statuses: members<MeetingStatus>(params, "status", MEETING_STATUSES),
      formats: members<MeetingFormat>(params, "format", FORMAT_ORDER),
      region: text(params, "region"),
      bureau: text(params, "bureau"),
      topic: text(params, "topic"),
      och: params.get("och") === "1",
      high: params.get("high") === "1",
    },
    selection: meeting ? { kind: "meeting", id: meeting } : country && /^[A-Z]{2}$/.test(country) ? { kind: "country", cca2: country } : null,
    tab: params.get("tab") === "countries" ? "countries" : "next",
  };
}

/** The query string for a view, without the "?": `country=JP&range=next30`. */
export function reachQuery(view: ReachView): string {
  const q = new URLSearchParams();
  if (view.selection?.kind === "country") q.set("country", view.selection.cca2);
  if (view.selection?.kind === "meeting") q.set("meeting", view.selection.id);
  q.set("range", view.range);
  if (view.window) {
    q.set("from", dayKey(view.window.from));
    q.set("to", dayKey(addNyDays(view.window.to, -1)));
  }
  const f = view.filters;
  for (const status of f.statuses) q.append("status", status);
  for (const format of f.formats) q.append("format", format);
  if (f.region) q.set("region", f.region);
  if (f.bureau) q.set("bureau", f.bureau);
  if (f.topic) q.set("topic", f.topic);
  if (f.och) q.set("och", "1");
  if (f.high) q.set("high", "1");
  if (view.tab !== "next") q.set("tab", view.tab);
  return q.toString();
}
