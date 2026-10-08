// @vitest-environment node
import { nyDate } from "@/lib/domain/fiscal-year";
import { NO_FILTERS } from "@/lib/domain/reach";
import { REGION_PAD } from "@/lib/geo/camera";
import { clampWindow, knownSelection, nextOf, openingCamera, reachScene, regionCamera, sceneRange, tourScene } from "@/lib/reach/scene";
import { DEFAULT_VIEW, type ReachView } from "@/lib/reach/url";
import { makeReachData, makeReachMeeting } from "@/tests/fixtures/reach";

// REACH_NOW is Monday, September 28, 2026, noon in Washington.
const OCT_6 = makeReachMeeting({ id: "jp_oct", start: new Date("2026-10-06T14:00:00Z") });
const MARCH = makeReachMeeting({ id: "jpke_mar", countries: ["JP", "KE"], format: "hybrid", start: new Date("2026-03-10T14:00:00Z"), participants: 9 });
const NOVEMBER = makeReachMeeting({ id: "br_nov", countries: ["BR"], region: "Americas", format: "virtual", start: new Date("2026-11-20T15:00:00Z") });
const LAST_YEAR = makeReachMeeting({ id: "de_2025", countries: ["DE"], region: "Europe", start: new Date("2025-12-01T15:00:00Z") });
const UNDATED = makeReachMeeting({ id: "gb_tbd", countries: ["GB"], region: "Europe", start: null });
const DATA = makeReachData([MARCH, OCT_6, NOVEMBER, LAST_YEAR, UNDATED]);

const view = (over: Partial<ReachView>): ReachView => ({ ...DEFAULT_VIEW, ...over });

describe("the full screen's scene", () => {
  it("shows this year by default: its meetings, its countries busiest first, and the sentence that describes the map", () => {
    const scene = reachScene(DATA, DEFAULT_VIEW);
    expect(scene.range).toEqual({ from: nyDate(2026, 1, 1), to: nyDate(2027, 1, 1) });
    expect(scene.window).toEqual(scene.range);
    expect(scene.narrowed).toBe(false);
    expect(scene.list.map((m) => m.id)).toEqual(["jpke_mar", "jp_oct", "br_nov"]); // the undated visit is never on the map
    expect(scene.countries.map((c) => [c.cca2, c.count])).toEqual([["JP", 2], ["BR", 1], ["KE", 1]]);
    expect(scene.countries[0]).toMatchObject({ name: "Japan", participants: 15, mix: { in_person: 1, hybrid: 1, virtual: 0 }, signal: "in_person" });
    expect(scene.countries[0]?.meetings.map((m) => m.id)).toEqual(["jpke_mar", "jp_oct"]);
    expect(scene.max).toBe(2);
    expect(scene.sentence).toBe("This year: 3 meetings in 3 countries. Most: Japan 2, Brazil 1, Kenya 1. 1 country has a meeting coming up in the next 30 days.");
  });

  it("measures a range from the payload alone, whatever the window: All runs from the first dated meeting's month to the end of the last's", () => {
    expect(sceneRange(DATA, "this")).toEqual({ from: nyDate(2026, 1, 1), to: nyDate(2027, 1, 1) });
    expect(sceneRange(DATA, "all")).toEqual({ from: nyDate(2025, 12, 1), to: nyDate(2026, 12, 1) });
    expect(reachScene(DATA, view({ range: "all", window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) } })).range).toEqual(sceneRange(DATA, "all"));
  });

  it("narrows to the reader's window, and names the window by its dates", () => {
    const scene = reachScene(DATA, view({ window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) } }));
    expect(scene.narrowed).toBe(true);
    expect(scene.label).toBe("Mar 1 – Mar 31, 2026");
    expect(scene.list.map((m) => m.id)).toEqual(["jpke_mar"]);
    expect(scene.sentence).toBe("Mar 1 – Mar 31, 2026: 1 meeting in 2 countries. Most: Japan 1, Kenya 1.");
  });

  it("keeps the window inside the range, and forgets one that leaves nothing narrower", () => {
    const range = { from: nyDate(2026, 9, 28), to: nyDate(2026, 10, 28) };
    expect(clampWindow({ from: nyDate(2026, 10, 1), to: nyDate(2026, 12, 1) }, range)).toEqual({ from: nyDate(2026, 10, 1), to: nyDate(2026, 10, 28) });
    expect(clampWindow({ from: nyDate(2025, 1, 1), to: nyDate(2025, 2, 1) }, range)).toBeNull();
    expect(clampWindow({ from: nyDate(2026, 1, 1), to: nyDate(2027, 1, 1) }, range)).toBeNull();
    expect(reachScene(DATA, view({ range: "last", window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) } })).narrowed).toBe(false);
  });

  it("counts only what passes the filters", () => {
    const scene = reachScene(DATA, view({ filters: { ...NO_FILTERS, formats: ["virtual"] } }));
    expect(scene.countries.map((c) => c.cca2)).toEqual(["BR"]);
    expect(scene.sentence).toBe("This year: 1 meeting in 1 country. Most: Brazil 1.");
  });

  it("finds a country's next meeting from today on, and none once the window holds only the past", () => {
    const [japan] = reachScene(DATA, DEFAULT_VIEW).countries;
    expect(japan && nextOf(japan, DATA.asOf)?.id).toBe("jp_oct");
    const [kenya] = reachScene(DATA, view({ filters: { ...NO_FILTERS, region: "Asia-Pacific" }, window: { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) } })).countries.filter((c) => c.cca2 === "KE");
    expect(kenya && nextOf(kenya, DATA.asOf)).toBeNull();
  });

  it("drops a deep link the payload cannot answer", () => {
    expect(knownSelection({ kind: "meeting", id: "jp_oct" }, DATA)).toEqual({ kind: "meeting", id: "jp_oct" });
    expect(knownSelection({ kind: "meeting", id: "someone_elses" }, DATA)).toBeNull();
    expect(knownSelection({ kind: "country", cca2: "KE" }, DATA)).toEqual({ kind: "country", cca2: "KE" });
    expect(knownSelection({ kind: "country", cca2: "FR" }, DATA)).toBeNull();
  });

  it("frames a region around its countries in the window, else around the ones it has ever had", () => {
    const scene = reachScene(DATA, DEFAULT_VIEW);
    expect(regionCamera(null, scene, DATA)).toEqual({ kind: "world" });
    expect(regionCamera("Americas", scene, DATA)).toEqual({ kind: "bounds", bounds: [[-47.88 - REGION_PAD, -15.79 - REGION_PAD], [-47.88 + REGION_PAD, -15.79 + REGION_PAD]] });
    // Europe has nothing this year: its frame is the countries it has had, Germany and the United Kingdom.
    expect(regionCamera("Europe", scene, DATA)).toEqual({ kind: "bounds", bounds: [[-0.13 - REGION_PAD, 51.51 - REGION_PAD], [13.4 + REGION_PAD, 52.52 + REGION_PAD]] });
    expect(regionCamera("Middle East & North Africa", scene, DATA)).toEqual({ kind: "world" });
  });

  it("keeps only the tour's countries on the map during the tour, the one being told in focus with its visit's format, and tilts in on it", () => {
    const stops = [OCT_6, NOVEMBER];
    const first = tourScene(stops, 0, DATA);
    expect(first.countries.map((c) => [c.cca2, c.count])).toEqual([["BR", 1], ["JP", 1]]);
    expect(first.focus).toEqual({ cca2: "JP", format: "in_person" });
    expect(first.camera).toEqual({ kind: "tour", cca2: "JP" });
    expect(tourScene(stops, 1, DATA)).toMatchObject({ focus: { cca2: "BR", format: "virtual" }, camera: { kind: "tour", cca2: "BR" } });

    // The summary frames every country the tour visited, flat again, with none in focus: from Japan
    // east across the Pacific to Brazil, the shorter way round.
    const summary = tourScene(stops, 2, DATA);
    expect(summary.focus).toBeNull();
    expect(summary.camera).toEqual({ kind: "bounds", bounds: [[139.69 - REGION_PAD, -15.79 - REGION_PAD], [-47.88 + 360 + REGION_PAD, 35.68 + REGION_PAD]] });
  });

  it("opens on the selected country, a selected meeting's first country, the region, or the world", () => {
    const scene = reachScene(DATA, DEFAULT_VIEW);
    expect(openingCamera(view({ selection: { kind: "country", cca2: "KE" } }), scene, DATA)).toEqual({ kind: "country", cca2: "KE" });
    expect(openingCamera(view({ selection: { kind: "meeting", id: "jpke_mar" } }), scene, DATA)).toEqual({ kind: "country", cca2: "JP" });
    expect(openingCamera(view({ filters: { ...NO_FILTERS, region: "Americas" } }), scene, DATA).kind).toBe("bounds");
    expect(openingCamera(DEFAULT_VIEW, scene, DATA)).toEqual({ kind: "world" });
  });
});
