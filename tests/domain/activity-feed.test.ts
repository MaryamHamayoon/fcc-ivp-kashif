// @vitest-environment node
import { bucketByWeek, dayKeyOf, groupByDay, monthTicks, pageCount, pageWindow, pulseWeeks, sinceFor, weekLabel, weekRange, weekStartKey } from "@/lib/domain/activity-feed";

// Saturday 29 Aug 2026, 10:00 in Washington (EDT, UTC-4).
const NOW = new Date("2026-08-29T14:00:00Z");

describe("Washington days and weeks", () => {
  it("files an instant under the Washington day, not the UTC one", () => {
    // 01:30 UTC on the 30th is still the evening of the 29th in Washington.
    expect(dayKeyOf(new Date("2026-08-30T01:30:00Z"))).toBe("2026-08-29");
    expect(dayKeyOf(new Date("2026-08-30T04:30:00Z"))).toBe("2026-08-30");
  });

  it("starts the week on Monday", () => {
    expect(weekStartKey(NOW)).toBe("2026-08-24"); // Saturday → the Monday before
    expect(weekStartKey(new Date("2026-08-24T12:00:00Z"))).toBe("2026-08-24"); // a Monday is its own start
    expect(weekStartKey(new Date("2026-08-30T12:00:00Z"))).toBe("2026-08-24"); // Sunday closes the week
    expect(weekStartKey(new Date("2026-08-31T12:00:00Z"))).toBe("2026-08-31");
  });

  it("turns a week key into Washington midnights, across a clock change", () => {
    const { start, end } = weekRange("2026-08-24");
    expect(start.toISOString()).toBe("2026-08-24T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-31T04:00:00.000Z");
    // The week the clocks go back (Sun 1 Nov 2026) is an hour longer.
    const fall = weekRange("2026-10-26");
    expect(fall.start.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(fall.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("refuses a week key that is not a date", () => {
    expect(() => weekRange("last-week")).toThrow();
  });
});

describe("sinceFor", () => {
  it("reads 'today' as Washington midnight and the rest as whole days back from it", () => {
    expect(sinceFor("today", NOW).toISOString()).toBe("2026-08-29T04:00:00.000Z");
    expect(sinceFor("7d", NOW).toISOString()).toBe("2026-08-23T04:00:00.000Z"); // today and the six days before
    expect(sinceFor("30d", NOW).toISOString()).toBe("2026-07-31T04:00:00.000Z");
    expect(sinceFor("90d", NOW).toISOString()).toBe("2026-06-01T04:00:00.000Z");
  });
});

describe("the weekly pulse", () => {
  it("lists the last n weeks, oldest first, ending on the current one", () => {
    expect(pulseWeeks(NOW, 3)).toEqual(["2026-08-10", "2026-08-17", "2026-08-24"]);
  });

  it("counts entries into their weeks and keeps the quiet weeks at zero", () => {
    const weeks = pulseWeeks(NOW, 3);
    const pulse = bucketByWeek([new Date("2026-08-11T15:00:00Z"), new Date("2026-08-16T15:00:00Z"), new Date("2026-08-28T15:00:00Z")], weeks);
    expect(pulse).toEqual([
      { week: "2026-08-10", count: 2 },
      { week: "2026-08-17", count: 0 },
      { week: "2026-08-24", count: 1 },
    ]);
  });

  it("ignores anything older than the first week it was asked about", () => {
    expect(bucketByWeek([new Date("2026-01-05T15:00:00Z")], pulseWeeks(NOW, 2))).toEqual([
      { week: "2026-08-17", count: 0 },
      { week: "2026-08-24", count: 0 },
    ]);
  });
});

describe("monthTicks", () => {
  it("names a month on the first week that opens in it, and nowhere else", () => {
    expect(monthTicks(["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-31", "2026-09-07"])).toEqual(["Jul", null, null, null, "Aug", null, null, "Sep"]);
  });

  it("leaves the first weeks bare when their month is nearly over, so two names never collide on a narrow strip", () => {
    expect(monthTicks(["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"])).toEqual([null, null, "Aug", null]);
    expect(monthTicks(["2026-07-27", "2026-08-03", "2026-08-10"])).toEqual([null, "Aug", null]);
  });

  it("has nothing to say about no weeks", () => {
    expect(monthTicks([])).toEqual([]);
  });
});

describe("weekLabel", () => {
  it("names a week by its Monday and its Sunday, repeating the month only when it changes", () => {
    expect(weekLabel("2026-08-17")).toBe("Aug 17 – 23");
    expect(weekLabel("2026-08-31")).toBe("Aug 31 – Sep 6");
    expect(weekLabel("2025-12-29")).toBe("Dec 29 – Jan 4");
  });
});

describe("groupByDay", () => {
  const entry = (id: string, iso: string) => ({ id, occurredAt: new Date(iso) });

  it("gathers entries under Today, Yesterday and then the date, keeping the order it was given", () => {
    const groups = groupByDay([entry("a", "2026-08-29T13:00:00Z"), entry("b", "2026-08-29T12:00:00Z"), entry("c", "2026-08-28T20:00:00Z"), entry("d", "2026-08-20T20:00:00Z")], NOW);
    expect(groups.map((g) => [g.key, g.label, g.items.map((i) => i.id)])).toEqual([
      ["2026-08-29", "Today", ["a", "b"]],
      ["2026-08-28", "Yesterday", ["c"]],
      ["2026-08-20", "Thu, Aug 20", ["d"]],
    ]);
  });

  it("adds the year once the day is in another one", () => {
    const [group] = groupByDay([entry("x", "2025-12-30T20:00:00Z")], NOW);
    expect(group?.label).toBe("Tue, Dec 30, 2025");
  });
});

describe("paging", () => {
  it("counts pages, and never fewer than one", () => {
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(50, 50)).toBe(1);
    expect(pageCount(51, 50)).toBe(2);
  });

  it("offers the pages around the current one, with gaps where it skips", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, "gap", 20]);
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 18, 19, 20]);
    expect(pageWindow(3, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
  });
});
