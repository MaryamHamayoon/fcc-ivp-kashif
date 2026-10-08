// @vitest-environment node
import { reachHref } from "@/components/dashboard/map/MapControls";
import { nyDate } from "@/lib/domain/fiscal-year";
import { NO_FILTERS } from "@/lib/domain/reach";
import { DEFAULT_VIEW, dayKey, parseDayKey, parseReachView, type ReachView, reachQuery } from "@/lib/reach/url";

const parse = (query: string) => parseReachView(new URLSearchParams(query));

describe("the full screen's URL", () => {
  it("opens on This year, the whole world and Next up when it says nothing", () => {
    expect(parse("")).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toEqual({ range: "this", window: null, filters: NO_FILTERS, selection: null, tab: "next" });
  });

  it("reads every key it writes", () => {
    const view = parse(
      "meeting=mtg_7&range=next365&from=2026-10-01&to=2026-10-31&status=confirmed&status=developing&format=virtual&format=in_person&region=Africa&bureau=WTB&topic=Spectrum+policy&och=1&high=1&tab=countries",
    );
    expect(view).toEqual({
      range: "next365",
      window: { from: nyDate(2026, 10, 1), to: nyDate(2026, 11, 1) },
      filters: { statuses: ["developing", "confirmed"], formats: ["in_person", "virtual"], region: "Africa", bureau: "WTB", topic: "Spectrum policy", och: true, high: true },
      selection: { kind: "meeting", id: "mtg_7" },
      tab: "countries",
    } satisfies ReachView);
  });

  it("drops what it cannot use rather than failing", () => {
    const view = parse("range=decade&status=bogus&status=cancelled&status=cancelled&format=carrier-pigeon&och=yes&from=2026-02-30&to=2026-03-01&country=japan&tab=map");
    expect(view.range).toBe("this");
    expect(view.filters.statuses).toEqual(["cancelled"]);
    expect(view.filters.formats).toEqual([]);
    expect(view.filters.och).toBe(false);
    expect(view.window).toBeNull(); // February has no 30th
    expect(view.selection).toBeNull();
    expect(view.tab).toBe("next");
    expect(parse("from=2026-05-01&to=2026-04-01").window).toBeNull(); // backwards
    expect(parse("from=2026-05-01").window).toBeNull(); // half a window
  });

  it("takes a country in any case, and prefers a meeting when a link names both", () => {
    expect(parse("country=jp").selection).toEqual({ kind: "country", cca2: "JP" });
    expect(parse("country=JP&meeting=mtg_2").selection).toEqual({ kind: "meeting", id: "mtg_2" });
  });

  it("writes a canonical query: a fixed order, the range always, other defaults left out", () => {
    const view: ReachView = {
      ...DEFAULT_VIEW,
      selection: { kind: "country", cca2: "KE" },
      window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) },
      filters: { ...NO_FILTERS, formats: ["hybrid"], och: true },
    };
    expect(reachQuery(view)).toBe("country=KE&range=this&from=2026-03-01&to=2026-03-31&format=hybrid&och=1");
    expect(reachQuery(DEFAULT_VIEW)).toBe("range=this");
    expect(parse(reachQuery(view))).toEqual(view);
  });

  it("opens the dashboard card's links exactly as the card wrote them", () => {
    for (const link of [reachHref({ range: "next30", region: "Middle East & North Africa" }), reachHref({ range: "this", country: "JP" })]) {
      const query = link.slice("/reach?".length);
      expect(reachQuery(parse(query))).toBe(query);
    }
    expect(parse("range=next30&region=Middle+East+%26+North+Africa").filters.region).toBe("Middle East & North Africa");
  });
});

describe("day keys", () => {
  it("name the day in Washington, whatever the instant's UTC date", () => {
    expect(dayKey(new Date("2026-03-02T03:30:00Z"))).toBe("2026-03-01"); // 10:30 PM on Mar 1 in Washington
    expect(parseDayKey("2026-11-01")).toEqual(nyDate(2026, 11, 1));
    expect(parseDayKey("2026-13-01")).toBeNull();
    expect(parseDayKey("Nov 1")).toBeNull();
  });
});
