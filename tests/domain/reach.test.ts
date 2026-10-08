// @vitest-environment node
import { byCountry, countryLabel, dateToBeSet, facetCounts, figures, isArriving, isFiltered, lens, maxCount, mixOf, NO_FILTERS, passes, type ReachFilters } from "@/lib/domain/reach";
import { rangeSpan } from "@/lib/domain/reach-time";
import { countOf } from "@/lib/format";
import { makeReachMeeting, REACH_NOW } from "@/tests/fixtures/reach";

const THIS_YEAR = rangeSpan("this", REACH_NOW);
const at = (iso: string) => new Date(iso);
const filters = (patch: Partial<ReachFilters>): ReachFilters => ({ ...NO_FILTERS, ...patch });

describe("filters", () => {
  const m = makeReachMeeting({ status: "developing", format: "hybrid", region: "Europe", bureaus: ["WTB", "OET"], topics: ["5G"], och: true, highPriority: true, countries: ["DE"] });

  it("lets everything through when nothing is set", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(passes(m, NO_FILTERS)).toBe(true);
  });

  it("narrows on every group, and skips only the group being counted", () => {
    expect(passes(m, filters({ statuses: ["confirmed"] }))).toBe(false);
    expect(passes(m, filters({ statuses: ["confirmed"] }), "status")).toBe(true);
    expect(passes(m, filters({ formats: ["hybrid", "virtual"] }))).toBe(true);
    expect(passes(m, filters({ region: "Africa" }))).toBe(false);
    expect(passes(m, filters({ bureau: "OET" }))).toBe(true);
    expect(passes(m, filters({ topic: "Spectrum policy" }))).toBe(false);
    expect(passes(makeReachMeeting({ och: false }), filters({ och: true }))).toBe(false);
    expect(passes(makeReachMeeting({ highPriority: false }), filters({ high: true }))).toBe(false);
    expect(isFiltered(filters({ high: true }))).toBe(true);
  });

  it("keeps only meetings dated inside the window", () => {
    const inside = makeReachMeeting({ start: at("2026-03-02T15:00:00Z") });
    const outside = makeReachMeeting({ start: at("2027-01-05T15:00:00Z") });
    const undated = makeReachMeeting({ start: null });
    expect(lens([inside, outside, undated], NO_FILTERS, THIS_YEAR)).toEqual([inside]);
  });

  it("counts each facet under every filter but its own, and keeps zero rows", () => {
    const list = [
      makeReachMeeting({ status: "confirmed", format: "in_person", region: "Asia-Pacific", bureaus: ["WTB"], topics: ["5G", "Satellites"] }),
      makeReachMeeting({ status: "confirmed", format: "virtual", region: "Europe", bureaus: ["WTB", "OET"], topics: ["5G"] }),
      makeReachMeeting({ status: "requested", format: "virtual", region: "Europe", bureaus: [], topics: [] }),
    ];
    const counts = facetCounts(list, filters({ statuses: ["confirmed"], region: "Europe" }), THIS_YEAR);
    // Status leaves out its own filter but keeps Europe: one confirmed, one requested, and zero rows stay.
    expect(counts.status.confirmed).toBe(1);
    expect(counts.status.requested).toBe(1);
    expect(counts.status.cancelled).toBe(0);
    // Format and the dropdowns count under both filters: only the confirmed European meeting.
    expect(counts.format).toEqual({ in_person: 0, hybrid: 0, virtual: 1 });
    expect(counts.bureau).toEqual([
      { key: "OET", count: 1 },
      { key: "WTB", count: 1 },
    ]);
    expect(counts.topic).toEqual([{ key: "5G", count: 1 }]);
    // Region leaves out the region filter.
    expect(counts.region).toEqual([
      { key: "Asia-Pacific", count: 1 },
      { key: "Europe", count: 1 },
    ]);
  });

  it("lists undated meetings still in play under Date to be set", () => {
    const open = makeReachMeeting({ start: null, status: "requested" });
    const closed = makeReachMeeting({ start: null, status: "closed" });
    const cancelled = makeReachMeeting({ start: null, status: "cancelled" });
    const dated = makeReachMeeting();
    expect(dateToBeSet([open, closed, cancelled, dated], NO_FILTERS)).toEqual([open]);
    expect(dateToBeSet([open], filters({ formats: ["virtual"] }))).toEqual([]);
  });
});

describe("countries", () => {
  it("counts a multi-country meeting once in Meetings and once for each of its countries", () => {
    const shared = makeReachMeeting({ countries: ["DE", "GB"], participants: 10, format: "hybrid" });
    const solo = makeReachMeeting({ countries: ["DE"], participants: 4, format: "virtual" });
    const aggregates = byCountry([shared, solo], REACH_NOW);
    expect(aggregates.get("DE")?.meetings).toHaveLength(2);
    expect(aggregates.get("DE")?.participants).toBe(14);
    expect(aggregates.get("DE")?.mix).toEqual({ in_person: 0, hybrid: 1, virtual: 1 });
    expect(aggregates.get("GB")?.meetings).toEqual([shared]);
    expect(maxCount(aggregates)).toBe(2);
    expect(figures([shared, solo])).toEqual({ meetings: 2, countries: 2, participants: 14, waiting: 0 });
  });

  it("never marks the United States: a U.S.-only meeting counts as a meeting but places nothing on the map", () => {
    const domestic = makeReachMeeting({ countries: [], participants: 3 });
    expect(byCountry([domestic], REACH_NOW).size).toBe(0);
    expect(figures([domestic])).toEqual({ meetings: 1, countries: 0, participants: 3, waiting: 0 });
    expect(countryLabel(domestic, (c) => c)).toBe("United States");
  });

  it("signals the soonest visit in the next 30 days, in its own format", () => {
    const later = makeReachMeeting({ countries: ["KE"], start: at("2026-10-20T14:00:00Z"), format: "in_person" });
    const sooner = makeReachMeeting({ countries: ["KE"], start: at("2026-10-02T14:00:00Z"), format: "virtual" });
    const beyond = makeReachMeeting({ countries: ["BR"], start: at("2026-11-20T14:00:00Z") });
    const past = makeReachMeeting({ countries: ["DE"], start: at("2026-09-01T14:00:00Z") });
    const aggregates = byCountry([later, sooner, beyond, past], REACH_NOW);
    expect(aggregates.get("KE")?.signal).toBe("virtual");
    expect(aggregates.get("BR")?.signal).toBeNull();
    expect(aggregates.get("DE")?.signal).toBeNull();
  });

  it("never signals a cancelled or on-hold visit, because nobody is arriving", () => {
    const cancelled = makeReachMeeting({ countries: ["JP"], start: at("2026-10-01T14:00:00Z"), status: "cancelled", format: "virtual" });
    const onHold = makeReachMeeting({ countries: ["JP"], start: at("2026-10-02T14:00:00Z"), status: "on_hold", format: "hybrid" });
    const real = makeReachMeeting({ countries: ["JP"], start: at("2026-10-09T14:00:00Z"), status: "developing", format: "in_person" });
    expect(isArriving(cancelled, REACH_NOW)).toBe(false);
    expect(isArriving(onHold, REACH_NOW)).toBe(false);
    expect(byCountry([cancelled, onHold, real], REACH_NOW).get("JP")?.signal).toBe("in_person");
    expect(byCountry([cancelled, onHold], REACH_NOW).get("JP")?.signal).toBeNull();
    // They still count as meetings in the window.
    expect(byCountry([cancelled, onHold], REACH_NOW).get("JP")?.meetings).toHaveLength(2);
  });

  it("ends the signal where the Next 30 days range ends", () => {
    expect(isArriving(makeReachMeeting({ start: at("2026-10-28T03:59:00Z") }), REACH_NOW)).toBe(true); // Oct 27, 11:59 PM in Washington
    expect(isArriving(makeReachMeeting({ start: at("2026-10-28T04:00:00Z") }), REACH_NOW)).toBe(false); // Oct 28, midnight
    expect(isArriving(makeReachMeeting({ start: at("2026-09-28T13:00:00Z") }), REACH_NOW)).toBe(false); // earlier today
  });

  it("names a visit by its first country, with a count for the rest", () => {
    const names: Record<string, string> = { JP: "Japan", KE: "Kenya" };
    expect(countryLabel(makeReachMeeting({ countries: ["JP", "KE"] }), (c) => names[c] ?? c)).toBe("Japan +1");
    expect(countryLabel(makeReachMeeting({ countries: ["KE"] }), (c) => names[c] ?? c)).toBe("Kenya");
  });

  it("mixes formats and counts the meetings waiting on someone", () => {
    const waiting = makeReachMeeting({ waiting: { who: "expert", label: "FCC expert", businessDays: 6, band: "warn" } });
    expect(mixOf([waiting, makeReachMeeting({ format: "virtual" })])).toEqual({ in_person: 1, hybrid: 0, virtual: 1 });
    expect(figures([waiting]).waiting).toBe(1);
  });
});

describe("countOf", () => {
  it("writes a count with its noun", () => {
    expect(countOf(1, "meeting")).toBe("1 meeting");
    expect(countOf(3, "country", "countries")).toBe("3 countries");
    expect(countOf(1204, "participant")).toBe("1,204 participants");
  });
});
