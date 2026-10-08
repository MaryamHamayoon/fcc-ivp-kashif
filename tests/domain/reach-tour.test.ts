// @vitest-environment node
import { announce, byCountry, cardRange, describeCard, describeMap, milesToWashington, NO_FILTERS, searchEntries, searchReach, tourStops, tourSummary, travelText } from "@/lib/domain/reach";
import { makeReachData, makeReachMeeting, REACH_COUNTRIES, REACH_NOW } from "@/tests/fixtures/reach";

const at = (iso: string) => new Date(iso);
const nameOf = (cca2: string) => REACH_COUNTRIES.find((c) => c.cca2 === cca2)?.name ?? cca2;

describe("the tour", () => {
  it("takes foreign visits in the next 90 days, soonest first, leaving out cancelled and on-hold ones", () => {
    const soon = makeReachMeeting({ start: at("2026-10-01T14:00:00Z") });
    const sooner = makeReachMeeting({ start: at("2026-09-30T14:00:00Z") });
    const tooFar = makeReachMeeting({ start: at("2027-01-05T14:00:00Z") });
    const past = makeReachMeeting({ start: at("2026-09-20T14:00:00Z") });
    const cancelled = makeReachMeeting({ start: at("2026-10-02T14:00:00Z"), status: "cancelled" });
    const onHold = makeReachMeeting({ start: at("2026-10-02T14:00:00Z"), status: "on_hold" });
    const domestic = makeReachMeeting({ start: at("2026-10-02T14:00:00Z"), countries: [] });
    const undated = makeReachMeeting({ start: null });
    expect(tourStops([soon, sooner, tooFar, past, cancelled, onHold, domestic, undated], NO_FILTERS, REACH_NOW)).toEqual([sooner, soon]);
  });

  it("stops at 12 and follows the filters", () => {
    const many = Array.from({ length: 15 }, (_, i) => makeReachMeeting({ start: at(`2026-10-${String(i + 1).padStart(2, "0")}T14:00:00Z`) }));
    expect(tourStops(many, NO_FILTERS, REACH_NOW)).toHaveLength(12);
    expect(tourStops(many, { ...NO_FILTERS, formats: ["virtual"] }, REACH_NOW)).toHaveLength(0);
  });

  it("measures the trip to Washington in great-circle miles, to the nearest hundred", () => {
    expect(milesToWashington({ lat: 35.6762, lng: 139.6503 })).toBe(6800); // Tokyo
    expect(milesToWashington({ lat: 51.5072, lng: -0.1276 })).toBe(3700); // London
    expect(milesToWashington({ lat: -1.2921, lng: 36.8219 })).toBe(7500); // Nairobi
    expect(milesToWashington({ lat: -15.7939, lng: -47.8828 })).toBe(4200); // Brasília
  });

  it("says how each visit comes", () => {
    const tokyo = { lat: 35.6762, lng: 139.6503 };
    expect(travelText(makeReachMeeting({ format: "virtual" }), tokyo)).toEqual({ label: "By video", detail: null });
    expect(travelText(makeReachMeeting({ format: "hybrid" }), tokyo)).toEqual({ label: "Hybrid", detail: "in the room and by video, about 6,800 miles from Washington" });
    expect(travelText(makeReachMeeting({ format: "in_person" }), tokyo)).toEqual({ label: "In person", detail: "traveling about 6,800 miles to Washington" });
  });

  it("sums the tour up", () => {
    const stops = [
      makeReachMeeting({ countries: ["JP"], status: "confirmed", readiness: 90, format: "in_person" }),
      makeReachMeeting({ countries: ["JP"], status: "developing", readiness: 40, format: "virtual", waiting: { who: "visitor", label: "the visiting delegation", businessDays: 3, band: "ok" } }),
      makeReachMeeting({ countries: ["KE"], status: "confirmed", readiness: 80, format: "virtual" }),
    ];
    expect(tourSummary(stops)).toEqual({ visits: 3, countries: 2, mix: { in_person: 1, hybrid: 0, virtual: 2 }, confirmed: 2, waiting: 1, ready: 2 });
  });
});

describe("the sentences", () => {
  it("describes the map from its own numbers", () => {
    const list = [
      makeReachMeeting({ countries: ["JP"], start: at("2026-10-01T14:00:00Z") }),
      makeReachMeeting({ countries: ["JP"], start: at("2026-12-01T14:00:00Z") }),
      makeReachMeeting({ countries: ["KE"], start: at("2026-03-01T14:00:00Z") }),
    ];
    const aggregates = byCountry(list, REACH_NOW);
    expect(describeMap("This year", list, aggregates, nameOf)).toBe("This year: 3 meetings in 2 countries. Most: Japan 2, Kenya 1. 1 country has a meeting coming up in the next 30 days.");
    expect(describeMap("Last year", [], new Map(), nameOf)).toBe("Last year: no meetings.");
    expect(announce(list)).toBe("3 meetings in 2 countries");
    expect(announce([])).toBe("0 meetings in 0 countries");
  });
});

describe("search", () => {
  const data = makeReachData([
    makeReachMeeting({ countries: ["JP"], orgName: "Ministry of Internal Affairs and Communications" }),
    makeReachMeeting({ countries: ["KE"], orgName: "Communications Authority of Kenya" }),
    makeReachMeeting({ countries: ["GB"], orgName: "Ofcom" }),
    makeReachMeeting({ countries: [], orgName: "U.S. Department of State" }),
  ]);
  const entries = searchEntries(data);

  it("covers every country and foreign organization in the program's history", () => {
    expect(entries.filter((e) => e.kind === "country").map((e) => e.cca2)).toEqual(["JP", "KE", "GB"]);
    expect(entries.find((e) => e.label === "Ofcom")).toEqual({ kind: "organization", cca2: "GB", label: "Ofcom", hint: "United Kingdom" });
    expect(entries.some((e) => e.label === "U.S. Department of State")).toBe(false);
  });

  it("offers an organization once for each country it came from, so every visit can be found", () => {
    const visits = searchEntries(
      makeReachData([
        makeReachMeeting({ countries: ["KE"], orgName: "GSMA — Public Policy" }),
        makeReachMeeting({ countries: ["BR"], orgName: "GSMA — Public Policy" }),
        makeReachMeeting({ countries: ["KE"], orgName: "GSMA — Public Policy" }),
      ]),
    );
    expect(searchReach(visits, "gsma")).toEqual([
      { kind: "organization", cca2: "KE", label: "GSMA — Public Policy", hint: "Kenya" },
      { kind: "organization", cca2: "BR", label: "GSMA — Public Policy", hint: "Brazil" },
    ]);
  });

  it("puts the earliest match first and returns eight at most", () => {
    expect(searchReach(entries, "ken").map((e) => e.label)).toEqual(["Kenya", "Communications Authority of Kenya"]);
    expect(searchReach(entries, "comm").map((e) => e.label)).toEqual(["Communications Authority of Kenya", "Ministry of Internal Affairs and Communications"]);
    expect(searchReach(entries, "   ")).toEqual([]);
    const crowd = Array.from({ length: 12 }, (_, i) => ({ kind: "organization" as const, cca2: "JP", label: `Office ${i}`, hint: "Japan" }));
    expect(searchReach(crowd, "office")).toHaveLength(8);
  });
});

describe("the card's two ranges", () => {
  const data = makeReachData([
    makeReachMeeting({ countries: ["JP"], start: at("2026-10-01T14:00:00Z"), format: "virtual", participants: 4 }),
    makeReachMeeting({ countries: ["JP"], start: at("2026-10-15T14:00:00Z"), format: "in_person", participants: 5 }),
    makeReachMeeting({ countries: ["JP"], start: at("2026-11-20T14:00:00Z") }),
    makeReachMeeting({ countries: ["JP"], start: at("2026-12-20T14:00:00Z") }),
    makeReachMeeting({ countries: ["KE"], start: at("2026-02-10T14:00:00Z") }),
    makeReachMeeting({ countries: ["BR"], start: at("2027-02-10T14:00:00Z") }),
  ]);

  it("counts the next 30 days and the calendar year with the full screen's own functions", () => {
    const next30 = cardRange(data, "next30", REACH_NOW);
    expect(next30.countries.map((c) => [c.cca2, c.count])).toEqual([["JP", 2]]);
    expect(next30.countries[0]).toMatchObject({ name: "Japan", region: "Asia-Pacific", participants: 9, mix: { in_person: 1, hybrid: 0, virtual: 1 }, signal: "virtual" });
    expect(cardRange(data, "this", REACH_NOW).countries.map((c) => [c.cca2, c.count])).toEqual([
      ["JP", 4],
      ["KE", 1],
    ]);
  });

  it("carries each country's next three meetings, soonest first, from today on", () => {
    const [japan, kenya] = cardRange(data, "this", REACH_NOW).countries;
    expect(japan?.next.map((m) => m.start?.toISOString())).toEqual(["2026-10-01T14:00:00.000Z", "2026-10-15T14:00:00.000Z", "2026-11-20T14:00:00.000Z"]);
    expect(kenya?.next).toEqual([]); // Kenya's only visit this year is behind us
  });

  it("describes its map in the full screen's words, counting a meeting held with two countries once", () => {
    const range = cardRange(
      makeReachData([makeReachMeeting({ countries: ["JP", "KE"], start: at("2026-10-01T14:00:00Z") }), makeReachMeeting({ countries: ["JP"], start: at("2026-11-20T14:00:00Z") })]),
      "this",
      REACH_NOW,
    );
    expect(range.meetings).toBe(2);
    expect(describeCard("This year", range)).toBe("This year: 2 meetings in 2 countries. Most: Japan 2, Kenya 1. 2 countries have a meeting coming up in the next 30 days.");
    expect(describeCard("Next 30 days", cardRange(makeReachData([]), "next30", REACH_NOW))).toBe("Next 30 days: no meetings.");
  });
});
