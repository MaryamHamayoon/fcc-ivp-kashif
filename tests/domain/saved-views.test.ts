import { addSavedView, isViewActive, parseSavedViews, removeSavedView, serializeSavedViews, viewQuery } from "@/lib/saved-views";

const KEYS = ["status", "regionId", "q", "view"] as const;
const NOW = new Date("2026-09-12T17:00:00Z");

describe("saved views", () => {
  it("remembers only the keys a workspace owns, in one stable order, so the same filters always match", () => {
    const a = viewQuery(new URLSearchParams("view=upcoming&layout=board&regionId=af&sort=updated"), KEYS);
    const b = viewQuery(new URLSearchParams("regionId=af&view=upcoming"), KEYS);
    expect(a).toBe("regionId=af&view=upcoming");
    expect(a).toBe(b);
    expect(isViewActive({ query: a }, new URLSearchParams("layout=calendar&regionId=af&view=upcoming"), KEYS)).toBe(true);
    expect(isViewActive({ query: a }, new URLSearchParams("regionId=eur&view=upcoming"), KEYS)).toBe(false);
  });

  it("sorts the values under one key, so the same filters match however they were picked", () => {
    const clearanceFirst = viewQuery(new URLSearchParams("status=clearance&status=confirmed&regionId=af"), KEYS);
    const confirmedFirst = viewQuery(new URLSearchParams("status=confirmed&status=clearance&regionId=af"), KEYS);
    expect(clearanceFirst).toBe("status=clearance&status=confirmed&regionId=af");
    expect(confirmedFirst).toBe(clearanceFirst);
    expect(isViewActive({ query: clearanceFirst }, new URLSearchParams("regionId=af&status=confirmed&status=clearance"), KEYS)).toBe(true);
    expect(isViewActive({ query: clearanceFirst }, new URLSearchParams("regionId=af&status=confirmed"), KEYS)).toBe(false);
  });

  it("adds at the top, replaces a view of the same name, trims the name and refuses an empty one", () => {
    const one = addSavedView([], "  Africa, soon ", "regionId=af&view=upcoming", NOW);
    expect(one).toEqual([{ id: `africa-soon-${NOW.getTime().toString(36)}`, name: "Africa, soon", query: "regionId=af&view=upcoming", savedAt: NOW.toISOString() }]);

    const two = addSavedView(one, "Clearance", "status=clearance", new Date(NOW.getTime() + 1000));
    expect(two.map((view) => view.name)).toEqual(["Clearance", "Africa, soon"]);

    const replaced = addSavedView(two, "africa, SOON", "regionId=af", new Date(NOW.getTime() + 2000));
    expect(replaced.map((view) => [view.name, view.query])).toEqual([
      ["africa, SOON", "regionId=af"],
      ["Clearance", "status=clearance"],
    ]);

    expect(addSavedView(two, "   ", "q=x", NOW)).toEqual(two);
    expect(removeSavedView(two, two[1]!.id).map((view) => view.name)).toEqual(["Clearance"]);
  });

  it("survives a round trip through storage and drops whatever in there is not a view", () => {
    const views = addSavedView([], "Clearance", "status=clearance", NOW);
    expect(parseSavedViews(serializeSavedViews(views))).toEqual(views);
    expect(parseSavedViews(null)).toEqual([]);
    expect(parseSavedViews("not json")).toEqual([]);
    expect(parseSavedViews('{"id":"x"}')).toEqual([]);
    expect(parseSavedViews('[{"id":"a","name":"  ","query":"x"},{"id":"b","name":"Kept","query":"fy=2026"},7,null,{"name":"no id","query":""}]')).toEqual([{ id: "b", name: "Kept", query: "fy=2026", savedAt: "" }]);
  });
});
