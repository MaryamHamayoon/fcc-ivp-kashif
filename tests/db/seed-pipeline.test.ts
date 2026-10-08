// @vitest-environment node
import { generateSeed, type SeedGraph } from "@/db/seed/generate";
import { isFederalHoliday } from "@/db/seed/holidays";
import { fiscalYearOf, fiscalYearRange, nyParts } from "@/lib/domain/fiscal-year";
import type { MeetingStatus } from "@/lib/domain/types";
import { addNyDays, rangeSpan, startOfNyDay } from "@/lib/domain/reach-time";

type Meeting = SeedGraph["meetings"][number];

const clockParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", weekday: "short", hour: "numeric", minute: "numeric" });
const nyClock = (d: Date) => {
  const p = Object.fromEntries(clockParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: p.weekday ?? "", minutes: Number(p.hour) * 60 + Number(p.minute) };
};
const dayKey = (d: Date) => {
  const { year, month, day } = nyParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const isWorkday = (d: Date) => !["Sat", "Sun"].includes(nyClock(d).weekday) && !isFederalHoliday(nyParts(d));
const inSpan = (d: Date | null, span: { from: Date; to: Date }) => d !== null && d.getTime() >= span.from.getTime() && d.getTime() < span.to.getTime();
const statusesOf = (list: readonly Meeting[]) => new Set(list.map((m) => m.status as MeetingStatus));

/** Seeds once per seed day; each seed is pure, so the graph can be shared by every check. */
const graphs = new Map<string, SeedGraph>();
const graphFor = (now: Date) => {
  const key = now.toISOString();
  if (!graphs.has(key)) graphs.set(key, generateSeed({ now }));
  return graphs.get(key)!;
};

/** The day a meeting is planned for: its first candidate date, which the seed writes first. */
const plannedOf = (g: SeedGraph, m: Meeting) => g.candidateDates.find((c) => c.meetingId === m.id)!.start;
/** What the map and the record show: the schedule, else the earliest open candidate. */
const shownOf = (g: SeedGraph, m: Meeting): Date | null => {
  if (m.scheduledStart) return m.scheduledStart;
  const open = g.candidateDates.filter((c) => c.meetingId === m.id && (c.status === "proposed" || c.status === "accepted")).map((c) => c.start.getTime());
  return open.length ? new Date(Math.min(...open)) : null;
};

describe.each([
  ["a Tuesday at the fiscal year's end", "2026-09-29T14:00:00Z"],
  ["a Friday just after the fiscal year starts", "2026-10-02T14:00:00Z"],
  ["a Monday in January", "2027-01-04T15:00:00Z"],
  ["a Saturday in May", "2027-05-15T16:00:00Z"],
])("seeded on %s", (_label, iso) => {
  const now = new Date(iso);
  const today = startOfNyDay(now);
  const setup = () => {
    const g = graphFor(now);
    const upcoming = g.meetings.filter((m) => plannedOf(g, m).getTime() >= today.getTime());
    const past = g.meetings.filter((m) => plannedOf(g, m).getTime() < today.getTime());
    const plannedWithin = (fromDay: number, toDay: number) =>
      upcoming.filter((m) => plannedOf(g, m).getTime() >= addNyDays(now, fromDay).getTime() && plannedOf(g, m).getTime() < addNyDays(now, toDay).getTime());
    return { g, upcoming, past, plannedWithin };
  };

  it("fills the coming weeks: 8 meetings in the next 7 days, 24 in the next 30, 36 over five months", () => {
    const { g, upcoming } = setup();
    const shown = g.meetings.map((m) => shownOf(g, m));
    expect(g.meetings).toHaveLength(127);
    expect(shown.filter((d) => inSpan(d, rangeSpan("next7", now)))).toHaveLength(8);
    expect(shown.filter((d) => inSpan(d, rangeSpan("next30", now)))).toHaveLength(24);
    expect(upcoming).toHaveLength(36);
    for (const m of upcoming) expect(plannedOf(g, m).getTime(), m.code).toBeLessThan(addNyDays(now, 151).getTime());
  });

  it("shows every upcoming meeting on its planned day, so an alternate date never pulls it earlier", () => {
    const { g, upcoming } = setup();
    for (const m of upcoming) {
      const shown = shownOf(g, m);
      expect(shown, m.code).not.toBeNull();
      expect(dayKey(shown!), m.code).toBe(dayKey(plannedOf(g, m)));
      expect(shown!.getTime(), `${m.code} starts after the seed`).toBeGreaterThan(now.getTime());
    }
  });

  it("books workdays between 9 am and 3:30 pm Washington time, never more than two meetings a day", () => {
    const { g } = setup();
    const perDay = new Map<string, number>();
    for (const m of g.meetings) {
      const planned = plannedOf(g, m);
      expect(isWorkday(planned), `${m.code} on ${dayKey(planned)}`).toBe(true);
      const { minutes } = nyClock(planned);
      expect(minutes, m.code).toBeGreaterThanOrEqual(9 * 60);
      expect(minutes, m.code).toBeLessThanOrEqual(15 * 60 + 30);
      perDay.set(dayKey(planned), (perDay.get(dayKey(planned)) ?? 0) + 1);
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(2);
  });

  it("never starts two meetings at the same time", () => {
    const { g } = setup();
    const starts = g.meetings.map((m) => (shownOf(g, m) ?? plannedOf(g, m)).toISOString());
    expect(starts.filter((iso, i) => starts.indexOf(iso) !== i)).toEqual([]);
  });

  it("never books one organization twice on the same day", () => {
    const { g } = setup();
    const booked = g.meetings.map((m) => `${m.organizationId} ${dayKey(plannedOf(g, m))}`);
    expect(booked.filter((key, i) => booked.indexOf(key) !== i)).toEqual([]);
  });

  it("moves each meeting further along the nearer its date", () => {
    const { plannedWithin } = setup();
    const thisWeek = plannedWithin(0, 7);
    expect([...statusesOf(thisWeek)].sort()).toEqual(["clearance", "confirmed"]);
    expect(thisWeek.filter((m) => m.status === "confirmed").length).toBeGreaterThanOrEqual(5);
    for (const st of statusesOf(plannedWithin(7, 30))) expect(["confirmed", "clearance", "developing"]).toContain(st);
    const later = plannedWithin(30, 151);
    for (const st of statusesOf(later)) expect(["developing", "requested", "clearance", "on_hold"]).toContain(st);
    expect(statusesOf(later).has("requested")).toBe(true);
    expect(later.some((m) => m.scheduledStart === null), "some later meetings have proposed dates only").toBe(true);
  });

  it("leaves every meeting still in clearance this week waiting on someone", () => {
    const { g, plannedWithin } = setup();
    const clearing = plannedWithin(0, 7).filter((m) => m.status === "clearance");
    expect(clearing.length).toBeGreaterThan(0);
    for (const m of clearing) {
      const open = g.activities.filter((a) => a.meetingId === m.id && (a.waitingOn ?? "none") !== "none" && !a.resolvedAt);
      expect(open.length, m.code).toBeGreaterThan(0);
    }
  });

  it("spreads the history evenly over last fiscal year and this one to date", () => {
    const { g, past } = setup();
    const priorFy = fiscalYearOf(now) - 1;
    expect(past).toHaveLength(91);
    for (const m of past) expect(m.fiscalYear, m.code).toBe(fiscalYearOf(plannedOf(g, m)));
    for (const m of g.meetings) expect(m.fiscalYear, m.code).toBe(fiscalYearOf(plannedOf(g, m)));
    expect(past.every((m) => m.fiscalYear === priorFy || m.fiscalYear === priorFy + 1)).toBe(true);
    const priorDays = 365;
    const currentDays = Math.round((today.getTime() - fiscalYearRange(priorFy + 1).start.getTime()) / 86_400_000);
    const expectedPrior = (91 * priorDays) / (priorDays + currentDays);
    expect(Math.abs(past.filter((m) => m.fiscalYear === priorFy).length - expectedPrior)).toBeLessThanOrEqual(4);
  });

  it("leaves no month of the record empty", () => {
    const { g, past } = setup();
    const monthOf = (d: Date) => dayKey(d).slice(0, 7);
    const held = new Map<string, number>();
    for (const m of past) held.set(monthOf(plannedOf(g, m)), (held.get(monthOf(plannedOf(g, m))) ?? 0) + 1);
    const first = fiscalYearRange(fiscalYearOf(now) - 1).start;
    const thisMonth = monthOf(now);
    for (let d = first; monthOf(d) < thisMonth; d = addNyDays(d, 31 - nyParts(d).day + 1)) {
      expect(held.get(monthOf(d)) ?? 0, monthOf(d)).toBeGreaterThanOrEqual(2);
    }
  });

  it("dates nothing after the seed: the log, close-outs and readouts are all behind it", () => {
    const { g } = setup();
    const late = (d: Date | null | undefined) => d != null && d.getTime() > now.getTime();
    expect(g.activities.filter((a) => late(a.occurredAt)).map((a) => `${a.meetingId} ${a.kind}`)).toEqual([]);
    expect(g.documents.filter((d) => late(d.addedAt)).map((d) => `${d.meetingId} ${d.kind}`)).toEqual([]);
    expect(g.meetings.filter((m) => late(m.closedAt) || late(m.completedAt)).map((m) => m.code)).toEqual([]);
  });
});

it("still seeds reference data alone when asked for no meetings", () => {
  const g = generateSeed({ now: new Date("2026-09-29T14:00:00Z"), meetingCount: 0 });
  expect(g.meetings).toEqual([]);
  expect(g.countries.length).toBeGreaterThan(0);
});
