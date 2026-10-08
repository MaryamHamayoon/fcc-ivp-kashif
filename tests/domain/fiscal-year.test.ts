// @vitest-environment node
import { fiscalYearOf, fiscalYearRange, fiscalYearProgress, fiscalMonthIndex, nyDate } from "@/lib/domain/fiscal-year";

describe("fiscal year (federal, America/New_York)", () => {
  it("assigns Oct 1 and later to the next FY", () => {
    expect(fiscalYearOf(new Date("2026-10-01T05:00:00Z"))).toBe(2027); // 01:00 NY, Oct 1
    expect(fiscalYearOf(new Date("2026-09-30T23:00:00Z"))).toBe(2026); // 19:00 NY, Sep 30
  });

  it("uses the New York midnight boundary, not UTC", () => {
    expect(fiscalYearOf(new Date("2026-10-01T03:00:00Z"))).toBe(2026); // still 23:00 NY on Sep 30
  });

  it("produces an inclusive range whose edges belong to the FY", () => {
    const { start, end } = fiscalYearRange(2026);
    expect(fiscalYearOf(start)).toBe(2026);
    expect(fiscalYearOf(end)).toBe(2026);
    expect(fiscalYearOf(new Date(start.getTime() - 1))).toBe(2025);
    expect(fiscalYearOf(new Date(end.getTime() + 1))).toBe(2027);
  });

  it("converts NY wall-clock times to UTC instants across DST", () => {
    expect(nyDate(2026, 1, 15, 9).toISOString()).toBe("2026-01-15T14:00:00.000Z"); // EST, UTC-5
    expect(nyDate(2026, 7, 15, 9).toISOString()).toBe("2026-07-15T13:00:00.000Z"); // EDT, UTC-4
  });

  it("reports progress through the year and the fiscal month index", () => {
    const p = fiscalYearProgress(new Date("2026-08-29T14:00:00Z"));
    expect(p.fy).toBe(2026);
    expect(p.dayCount).toBe(365);
    expect(p.dayIndex).toBe(333); // Oct 1 = day 1 … Aug 29 = day 333
    expect(fiscalMonthIndex(new Date("2026-10-15T12:00:00Z"))).toBe(0);
    expect(fiscalMonthIndex(new Date("2026-08-29T14:00:00Z"))).toBe(10);
    expect(fiscalMonthIndex(new Date("2026-09-15T12:00:00Z"))).toBe(11);
  });
});
