// @vitest-environment node
import { nyDate } from "@/lib/domain/fiscal-year";
import {
  addNyDays,
  agendaDayLabel,
  dayDistance,
  dayLabel,
  groupLabel,
  isRangeKey,
  nyDaysIn,
  nyMonthsIn,
  nyYearsIn,
  rangeSpan,
  rangeText,
  spanDays,
  startOfNyDay,
  startOfNyWeek,
  tickLabel,
  timelineView,
  windowText,
} from "@/lib/domain/reach-time";

/** Monday, September 28, 2026, noon in Washington. */
const NOW = new Date("2026-09-28T16:00:00Z");
const iso = (d: Date) => d.toISOString();

describe("the Washington calendar", () => {
  it("steps whole days across both daylight-saving Sundays", () => {
    // Spring forward, Sunday March 8, 2026: that midnight is still standard time.
    expect(iso(addNyDays(nyDate(2026, 3, 7), 1))).toBe("2026-03-08T05:00:00.000Z");
    expect(iso(addNyDays(nyDate(2026, 3, 8), 1))).toBe("2026-03-09T04:00:00.000Z");
    // Fall back, Sunday November 1, 2026: that midnight is still daylight time, and the day lasts 25 hours.
    expect(iso(addNyDays(nyDate(2026, 10, 31), 1))).toBe("2026-11-01T04:00:00.000Z");
    expect(iso(addNyDays(nyDate(2026, 11, 1), 1))).toBe("2026-11-02T05:00:00.000Z");
  });

  it("finds the day by the clock in Washington, not the reader's", () => {
    expect(iso(startOfNyDay(new Date("2027-01-01T04:30:00Z")))).toBe("2026-12-31T05:00:00.000Z"); // 11:30 PM on New Year's Eve
  });

  it("starts weeks on Sunday", () => {
    expect(iso(startOfNyWeek(new Date("2026-09-30T15:00:00Z")))).toBe("2026-09-27T04:00:00.000Z");
    expect(iso(startOfNyWeek(new Date("2026-09-27T04:00:00Z")))).toBe("2026-09-27T04:00:00.000Z");
  });

  it("lists the days, month starts and year starts inside a span", () => {
    expect(nyDaysIn(rangeSpan("next7", NOW)).map(iso)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((d) => `${d}T04:00:00.000Z`));
    expect(nyMonthsIn(rangeSpan("this", NOW))).toHaveLength(12);
    expect(nyMonthsIn(rangeSpan("next30", NOW)).map(iso)).toEqual(["2026-10-01T04:00:00.000Z"]);
    expect(nyYearsIn({ from: nyDate(2025, 3, 1), to: nyDate(2027, 2, 1) }).map(iso)).toEqual(["2025-01-01T05:00:00.000Z", "2026-01-01T05:00:00.000Z", "2027-01-01T05:00:00.000Z"]);
  });
});

describe("ranges", () => {
  it("names the six ranges and nothing else", () => {
    expect(isRangeKey("next30")).toBe(true);
    expect(isRangeKey("fy26")).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
  });

  it("counts calendar years, never the fiscal year", () => {
    const thisYear = rangeSpan("this", NOW);
    expect([iso(thisYear.from), iso(thisYear.to)]).toEqual(["2026-01-01T05:00:00.000Z", "2027-01-01T05:00:00.000Z"]);
    const lastYear = rangeSpan("last", NOW);
    expect([iso(lastYear.from), iso(lastYear.to)]).toEqual(["2025-01-01T05:00:00.000Z", "2026-01-01T05:00:00.000Z"]);
    expect(spanDays(thisYear)).toBe(365);
    expect(spanDays(rangeSpan("last", new Date("2025-06-01T12:00:00Z")))).toBe(366); // 2024 was a leap year
  });

  it("counts the next N days from midnight in Washington today", () => {
    const next30 = rangeSpan("next30", NOW);
    expect([iso(next30.from), iso(next30.to)]).toEqual(["2026-09-28T04:00:00.000Z", "2026-10-28T04:00:00.000Z"]);
    expect(iso(rangeSpan("next7", NOW).to)).toBe("2026-10-05T04:00:00.000Z");
    expect(iso(rangeSpan("next365", NOW).to)).toBe("2027-09-28T04:00:00.000Z");
    // Thirty calendar days across the fall-back Sunday still end at midnight.
    expect(iso(rangeSpan("next30", new Date("2026-10-20T16:00:00Z")).to)).toBe("2026-11-19T05:00:00.000Z");
  });

  it("spans All from the first dated meeting's month to the end of the last one's", () => {
    const all = rangeSpan("all", NOW, [new Date("2027-01-22T15:00:00Z"), new Date("2025-03-14T15:00:00Z")]);
    expect([iso(all.from), iso(all.to)]).toEqual(["2025-03-01T05:00:00.000Z", "2027-02-01T05:00:00.000Z"]);
    expect(rangeSpan("all", NOW, [])).toEqual(rangeSpan("this", NOW));
  });

  it("chooses the timeline's view from the span and the strip's height", () => {
    expect(timelineView(rangeSpan("this", NOW), 172)).toBe("weeks");
    expect(timelineView(rangeSpan("next30", NOW), 172)).toBe("days");
    expect(timelineView(rangeSpan("next7", NOW), 172)).toBe("agenda");
    expect(timelineView(rangeSpan("this", NOW), 64)).toBe("compact");
    const days = (n: number) => ({ from: nyDate(2026, 1, 1), to: nyDate(2026, 1, 1 + n) });
    expect([8, 9, 32, 33].map((n) => timelineView(days(n), 172))).toEqual(["agenda", "days", "days", "weeks"]);
  });
});

describe("labels", () => {
  it("groups upcoming meetings by calendar week, then by month", () => {
    expect(groupLabel(new Date("2026-10-03T14:00:00Z"), NOW)).toBe("This week"); // Saturday
    expect(groupLabel(new Date("2026-10-04T14:00:00Z"), NOW)).toBe("Next week"); // the next Sunday
    expect(groupLabel(new Date("2026-10-10T14:00:00Z"), NOW)).toBe("Next week");
    expect(groupLabel(new Date("2026-10-11T14:00:00Z"), NOW)).toBe("October 2026");
    expect(groupLabel(new Date("2026-11-02T14:00:00Z"), NOW)).toBe("November 2026");
  });

  it("writes a span the way a person reads it", () => {
    expect(rangeText(rangeSpan("this", NOW))).toBe("Jan 1 – Dec 31, 2026");
    expect(rangeText({ from: nyDate(2026, 9, 28), to: nyDate(2026, 9, 29) })).toBe("Mon, Sep 28, 2026");
    expect(rangeText({ from: nyDate(2026, 12, 1), to: nyDate(2027, 2, 1) })).toBe("Dec 1, 2026 – Jan 31, 2027");
    expect(windowText("this", rangeSpan("this", NOW), false)).toBe("This year · Jan 1 – Dec 31, 2026");
    expect(windowText("this", { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) }, true)).toBe("Mar 1 – Mar 31, 2026");
  });

  it("labels day columns as the room allows", () => {
    const tuesday = nyDate(2026, 9, 29);
    const first = nyDate(2026, 10, 1);
    expect(dayLabel(nyDate(2026, 9, 28), 50, NOW)).toBe("Today");
    expect(dayLabel(tuesday, 120, NOW)).toBe("Tue, Sep 29");
    expect(dayLabel(tuesday, 50, NOW)).toBe("Tue 29");
    expect(dayLabel(first, 50, NOW)).toBe("Oct 1");
    expect(dayLabel(tuesday, 20, NOW)).toBe("29");
    expect(dayLabel(first, 20, NOW)).toBe("Oct");
    expect(agendaDayLabel(nyDate(2026, 9, 28), NOW)).toBe("Today · Mon, Sep 28");
    expect(agendaDayLabel(tuesday, NOW)).toBe("Tue, Sep 29");
  });

  it("puts the year on January and on the first tick only", () => {
    expect(tickLabel(nyDate(2027, 1, 1), false)).toBe("Jan 2027");
    expect(tickLabel(nyDate(2026, 2, 1), false)).toBe("Feb");
    expect(tickLabel(nyDate(2026, 3, 1), true)).toBe("Mar 2026");
  });

  it("says how far away a day is in whole calendar days", () => {
    expect(dayDistance(new Date("2026-09-28T23:00:00Z"), NOW)).toBe("today");
    expect(dayDistance(new Date("2026-09-29T13:00:00Z"), NOW)).toBe("tomorrow");
    expect(dayDistance(new Date("2026-10-10T13:00:00Z"), NOW)).toBe("in 12 days");
    expect(dayDistance(new Date("2026-09-25T13:00:00Z"), NOW)).toBe("3 days ago");
  });
});

describe("the reader's own time zone", () => {
  const original = process.env.TZ;
  afterEach(() => {
    process.env.TZ = original;
  });

  it.each([
    ["Asia/Tokyo", -540],
    ["America/Los_Angeles", 480],
    ["UTC", 0],
  ])("changes nothing in %s", (zone, offset) => {
    process.env.TZ = zone;
    // Guard: the runtime really moved the local clock, or this test proves nothing.
    expect(new Date(Date.UTC(2026, 0, 1)).getTimezoneOffset()).toBe(offset);
    expect(iso(startOfNyDay(new Date("2027-01-01T04:30:00Z")))).toBe("2026-12-31T05:00:00.000Z");
    expect(iso(rangeSpan("this", NOW).from)).toBe("2026-01-01T05:00:00.000Z");
    expect(iso(rangeSpan("next30", NOW).to)).toBe("2026-10-28T04:00:00.000Z");
    expect(groupLabel(new Date("2026-10-04T03:30:00Z"), NOW)).toBe("This week"); // Saturday 11:30 PM in Washington, already Sunday in Tokyo
    expect(dayLabel(nyDate(2026, 10, 1), 50, NOW)).toBe("Oct 1");
  });
});
