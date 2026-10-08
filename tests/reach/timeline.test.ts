// @vitest-environment node
import { nyDate } from "@/lib/domain/fiscal-year";
import { meetingName, NO_FILTERS, type ReachMeeting } from "@/lib/domain/reach";
import { rangeSpan, type Span } from "@/lib/domain/reach-time";
import { fadeOf, lastDay, markOpacity, markTip, rowName, snapWindow, stepWindow, timelineLayout, timelineMeetings, timelineScale } from "@/lib/reach/timeline";
import { makeReachMeeting, REACH_COUNTRIES, REACH_NOW } from "@/tests/fixtures/reach";

// REACH_NOW is Monday, September 28, 2026, noon in Washington.
const THIS_YEAR = rangeSpan("this", REACH_NOW);
const NEXT_30 = rangeSpan("next30", REACH_NOW);
const NEXT_7 = rangeSpan("next7", REACH_NOW);
/** Ten in the morning in Washington (daylight time) on a day in 2026. */
const at10 = (month: number, day: number) => nyDate(2026, month, day, 10);
const on = (month: number, day: number, over: Partial<ReachMeeting> = {}) => makeReachMeeting({ start: at10(month, day), ...over });
const nameOf = (cca2: string) => REACH_COUNTRIES.find((c) => c.cca2 === cca2)?.name ?? cca2;

/** Every calendar day this many pixels wide, between 16 px margins. */
const widthFor = (span: Span, perDay: number) => 32 + perDay * Math.round((span.to.getTime() - span.from.getTime()) / 86_400_000);
const layout = (span: Span, perDay: number, height: number, meetings: ReachMeeting[] = [], lastBooked: Date | null = null) => {
  const result = timelineLayout({ span, width: widthFor(span, perDay), height, meetings, now: REACH_NOW, lastBooked });
  if (!result) throw new Error("no layout");
  return result;
};

describe("the timeline's scale", () => {
  it("gives every Washington day the same width, even the 23-hour day that starts daylight time", () => {
    const march = { from: nyDate(2026, 3, 1), to: nyDate(2026, 4, 1) };
    const scale = timelineScale(march, 16, 16 + 31 * 10);
    expect(scale.x(nyDate(2026, 3, 8))).toBe(86);
    expect(scale.x(nyDate(2026, 3, 9))).toBe(96);
    // Half of that short day is 11.5 hours in.
    expect(scale.invert(91).toISOString()).toBe("2026-03-08T16:30:00.000Z");
    expect(scale.x(new Date("2026-03-08T16:30:00Z"))).toBeCloseTo(91);
  });

  it("clamps what it inverts to the span", () => {
    const scale = timelineScale(NEXT_30, 16, 16 + 30 * 40);
    expect(scale.invert(0)).toEqual(NEXT_30.from);
    expect(scale.invert(5000)).toEqual(NEXT_30.to);
  });
});

describe("the timeline's meetings", () => {
  it("takes the range's dated meetings through the filters, by date and then by status", () => {
    const late = on(10, 6, { status: "requested" });
    const early = on(3, 2);
    const same = on(10, 6, { status: "developing" });
    const virtual = on(5, 5, { format: "virtual" });
    const list = timelineMeetings([late, early, same, virtual, on(1, 1, { start: null }), makeReachMeeting({ start: nyDate(2025, 6, 2) })], { ...NO_FILTERS, formats: ["in_person"] }, THIS_YEAR);
    expect(list).toEqual([early, late, same]);
  });
});

describe("the weeks view (a range longer than 32 days)", () => {
  it("stacks a week's meetings from the axis up, in date order, and keeps one meeting at full size", () => {
    const one = layout(THIS_YEAR, 4, 126, [on(10, 6)]);
    expect(one.view).toBe("weeks");
    expect(one.markSize).toBe(9);
    // The week of Sunday, October 4 runs from x = 1120 to 1148.
    expect(one.marks.map((m) => [m.cx, m.cy])).toEqual([[1134, 96.5]]);

    const three = layout(THIS_YEAR, 4, 126, [on(10, 5), on(10, 6), on(10, 8)]);
    expect(three.marks.map((m) => m.cy)).toEqual([96.5, 85.5, 74.5]);
    expect(new Set(three.marks.map((m) => m.cx))).toEqual(new Set([1134]));
  });

  it("spills a crowded week into a second column rather than shrinking every mark", () => {
    const busy = Array.from({ length: 10 }, (_, i) => on(10, 5 + (i % 5)));
    const crowded = layout(THIS_YEAR, 4, 126, busy);
    expect(crowded.markSize).toBe(9);
    expect([...new Set(crowded.marks.map((m) => m.cx))].sort()).toEqual([1128.5, 1139.5]);
    expect(crowded.marks.filter((m) => m.cx === 1128.5)).toHaveLength(8);
  });

  it("bands alternate months, ticks every month with the year on the first and on January, and draws Today", () => {
    const year = layout(THIS_YEAR, 4, 126);
    expect(year.bands.map((b) => [b.x, b.width, b.kind])).toEqual([
      [140, 112, "alternate"],
      [376, 120, "alternate"],
      [620, 120, "alternate"],
      [864, 124, "alternate"],
      [1108, 124, "alternate"],
      [1352, 124, "alternate"],
    ]);
    expect(year.ticks.map((t) => t.label)).toEqual(["Jan 2026", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect(year.ticks[1]).toMatchObject({ x: 140, labelX: 143, anchor: "start" });
    expect(year.today).toEqual({ x: 1098, flip: false });
  });

  it("says where the calendar runs out, or that the range holds nothing", () => {
    const ending = layout(THIS_YEAR, 4, 126, [on(10, 6)], at10(10, 6));
    expect(ending.note).toMatchObject({ text: "Nothing booked after Oct 6, 2026", y: 56 });
    expect(ending.note?.x).toBeCloseTo((16 + (278 + 10 / 24) * 4 + 1476) / 2);
    // A booking near the range's end leaves no stretch worth a note.
    expect(layout(THIS_YEAR, 4, 126, [on(10, 6)], nyDate(2026, 12, 20)).note).toBeNull();
    expect(layout(THIS_YEAR, 4, 126, [], nyDate(2026, 12, 20)).note?.text).toBe("Nothing scheduled in these days");
  });

  it("bands alternate years past 400 days, labels each year, and thins month labels to what fits", () => {
    const all = { from: nyDate(2024, 10, 1), to: nyDate(2027, 3, 1) };
    const wide = timelineLayout({ span: all, width: 1440, height: 126, meetings: [], now: REACH_NOW, lastBooked: null });
    expect(wide?.years.map((y) => y.label)).toEqual(["2024", "2025", "2026", "2027"]);
    expect(wide?.bands).toHaveLength(2);
    expect(wide?.ticks.every((t) => t.label !== null)).toBe(true);

    const narrow = timelineLayout({ span: all, width: 1000, height: 126, meetings: [], now: REACH_NOW, lastBooked: null });
    const labels = narrow?.ticks.flatMap((t) => (t.label ? [t.label] : []));
    expect(labels?.slice(0, 4)).toEqual(["Nov 2024", "Jan 2025", "Mar", "May"]);
    expect(narrow?.ticks).toHaveLength(29);
  });
});

describe("the days view (9 to 32 days)", () => {
  it("puts one chip per meeting in its day's column, from the axis up", () => {
    const month = layout(NEXT_30, 40, 126, [on(10, 6), on(10, 6, { format: "virtual" })]);
    expect(month.view).toBe("days");
    expect(month.columnWidth).toBe(40);
    expect(month.chips.map((c) => [c.left, c.top, c.width])).toEqual([
      [339, 85, 34],
      [339, 67, 34],
    ]);
    expect(month.more).toEqual([]);
  });

  it("opens a day that overflows with +N instead of squeezing its chips", () => {
    const month = layout(NEXT_30, 40, 126, Array.from({ length: 7 }, () => on(10, 6)));
    expect(month.chips).toHaveLength(4);
    expect(month.more).toEqual([{ day: nyDate(2026, 10, 6), left: 339, top: 13, width: 34, count: 3 }]);
  });

  it("bands weekends and today, labels days as room allows, and says so when nothing is scheduled", () => {
    const month = layout(NEXT_30, 40, 126);
    expect(month.bands.filter((b) => b.kind === "weekend")).toHaveLength(8);
    expect(month.bands.find((b) => b.kind === "today")).toMatchObject({ x: 16, width: 40 });
    expect(month.ticks.slice(0, 4).map((t) => t.label)).toEqual(["Today", "Tue 29", "Wed 30", "Oct 1"]);
    expect(month.ticks[0]).toMatchObject({ x: 16, labelX: 36, anchor: "middle", today: true });
    expect(month.today).toBeNull();
    expect(month.note).toMatchObject({ x: 616, y: 56, text: "Nothing scheduled in these days" });
  });
});

describe("the agenda (8 days or fewer)", () => {
  it("gives each day a column under its day button, rows in time order, and +N more past the room", () => {
    const week = layout(NEXT_7, 200, 126, [on(9, 29), makeReachMeeting({ start: nyDate(2026, 9, 29, 14) }), ...Array.from({ length: 8 }, () => on(10, 1))]);
    expect(week.view).toBe("agenda");
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toMatchObject({ label: "Today · Mon, Sep 28", today: true, left: 19, width: 194, rows: [], more: null });
    expect(week.days[1]?.rows.map((r) => r.top)).toEqual([21, 36]);
    expect(week.days[3]?.rows).toHaveLength(5);
    expect(week.days[3]?.more).toEqual({ top: 96, count: 3 });
    expect(week.dividers).toEqual([216.5, 416.5, 616.5, 816.5, 1016.5, 1216.5]);
    expect(week.ticks).toEqual([]);
  });
});

describe("the tucked strip (under 80 px)", () => {
  it("draws compact marks at the range's grain, with no year labels", () => {
    const year = layout(THIS_YEAR, 4, 64, [on(10, 6)]);
    expect(year.view).toBe("compact");
    expect(year.markSize).toBe(6);
    expect(year.marks[0]).toMatchObject({ cx: 1134, cy: 41 });

    const month = layout(NEXT_30, 40, 64, [on(10, 6)]);
    expect(month.marks[0]?.cx).toBe(356);
    expect(month.bands.some((b) => b.kind === "today")).toBe(true);
  });

  it("draws nothing into a box too small to read", () => {
    expect(timelineLayout({ span: THIS_YEAR, width: 40, height: 126, meetings: [], now: REACH_NOW, lastBooked: null })).toBeNull();
  });
});

describe("the window", () => {
  it("snaps a drag's end to whole days in the day views, never empty and never outside the range", () => {
    expect(snapWindow({ from: nyDate(2026, 10, 3, 13), to: nyDate(2026, 10, 9, 11) }, NEXT_30)).toEqual({ from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 9) });
    expect(snapWindow({ from: nyDate(2026, 10, 3, 13), to: nyDate(2026, 10, 3, 15) }, NEXT_30)).toEqual({ from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 5) });
    expect(snapWindow({ from: nyDate(2026, 10, 27, 20), to: nyDate(2026, 10, 30) }, NEXT_30)).toEqual({ from: nyDate(2026, 10, 27), to: NEXT_30.to });
  });

  it("moves an edge from the keyboard: a day in the day views, a week otherwise, a month with Page Up and Page Down", () => {
    const window = { from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 9) };
    expect(stepWindow(window, "from", "ArrowRight", NEXT_30, true)).toEqual({ from: nyDate(2026, 10, 5), to: window.to });
    expect(stepWindow(window, "to", "ArrowLeft", NEXT_30, true)).toEqual({ from: window.from, to: nyDate(2026, 10, 8) });
    expect(stepWindow(window, "from", "Home", NEXT_30, true)).toEqual({ from: NEXT_30.from, to: window.to });
    expect(stepWindow(window, "to", "End", NEXT_30, true)).toEqual({ from: window.from, to: NEXT_30.to });

    const winter = { from: nyDate(2026, 1, 31), to: nyDate(2026, 3, 1) };
    expect(stepWindow(winter, "to", "ArrowRight", THIS_YEAR, false)).toEqual({ from: winter.from, to: nyDate(2026, 3, 8) });
    // January 31 plus a month is the last day of February.
    expect(stepWindow(winter, "from", "PageUp", THIS_YEAR, false)).toEqual({ from: nyDate(2026, 2, 28), to: winter.to });
    expect(stepWindow(winter, "to", "PageDown", THIS_YEAR, false)).toEqual({ from: winter.from, to: nyDate(2026, 2, 1) });
  });

  it("never lets one edge pass the other, and ignores keys that are not the slider's", () => {
    const day = { from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 5) };
    expect(stepWindow(day, "to", "ArrowLeft", NEXT_30, true)).toEqual(day);
    expect(stepWindow(day, "from", "End", NEXT_30, true)).toEqual(day);
    expect(stepWindow(day, "from", "a", NEXT_30, true)).toBeNull();
  });

  it("names the window's last day, the day before its end or the day it stops in", () => {
    expect(lastDay({ from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 9) })).toEqual(nyDate(2026, 10, 8));
    expect(lastDay({ from: nyDate(2026, 10, 4), to: nyDate(2026, 10, 9, 15) })).toEqual(nyDate(2026, 10, 9));
  });
});

describe("fading", () => {
  const window = { from: nyDate(2026, 10, 1), to: nyDate(2026, 11, 1) };

  it("keeps the window's meetings at full strength, a proposed date at half", () => {
    expect(fadeOf(on(10, 6), window, null)).toBe("in");
    expect(markOpacity(on(10, 6), "in")).toBe(1);
    expect(markOpacity(on(10, 6, { proposed: true }), "in")).toBe(0.5);
  });

  it("fades meetings outside the window to a quarter, and every other country's to 14% while one is lit", () => {
    expect(fadeOf(on(11, 6), window, null)).toBe("out");
    expect(markOpacity(on(11, 6), "out")).toBe(0.25);
    expect(fadeOf(on(10, 6, { countries: ["KE"] }), window, "JP")).toBe("dim");
    expect(markOpacity(on(10, 6), "dim")).toBe(0.14);
    // A visit with Japan among its countries stays lit with Japan.
    expect(fadeOf(on(10, 6, { countries: ["KE", "JP"] }), window, "JP")).toBe("in");
  });
});

describe("names", () => {
  const proposed = on(9, 29, { proposed: true });

  it("names an agenda row first by its time, then as the meeting's chip and its row in Details name it", () => {
    expect(rowName(on(9, 29, { countries: ["JP", "KE"], format: "hybrid", status: "developing" }), nameOf)).toBe(
      "10:00 AM, Japan and Kenya, Ministry of Internal Affairs and Communications, Sep 29, 2026, Hybrid, Developing",
    );
    expect(rowName(proposed, nameOf)).toBe(`10:00 AM, ${meetingName(proposed, nameOf)}`);
    expect(meetingName(proposed, nameOf)).toBe("Japan, Ministry of Internal Affairs and Communications, Sep 29, 2026, proposed, In person, Confirmed");
  });

  it("gives a mark's tooltip three lines: countries and date, organization and time, format and status", () => {
    expect(markTip(on(9, 29, { countries: ["JP", "KE"], proposed: true }), nameOf)).toEqual([
      "Japan, Kenya · Sep 29, 2026 (proposed)",
      "Ministry of Internal Affairs and Communications · 10:00 AM ET",
      "In person · Confirmed",
    ]);
  });
});
