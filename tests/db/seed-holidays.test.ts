// @vitest-environment node
import { isFederalHoliday } from "@/db/seed/holidays";

const on = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return isFederalHoliday({ year, month, day });
};

describe("isFederalHoliday", () => {
  it.each([
    ["2026-09-07", "Labor Day"],
    ["2026-10-12", "Columbus Day"],
    ["2026-11-11", "Veterans Day"],
    ["2026-11-26", "Thanksgiving Day"],
    ["2026-12-25", "Christmas Day"],
    ["2027-01-01", "New Year's Day"],
    ["2027-01-18", "Birthday of Martin Luther King, Jr."],
    ["2027-02-15", "Washington's Birthday"],
    ["2027-05-31", "Memorial Day"],
    ["2027-07-04", "Independence Day, on a Sunday"],
  ])("%s is %s", (iso) => {
    expect(on(iso)).toBe(true);
  });

  it.each([
    ["2026-07-03", "Independence Day falls on a Saturday"],
    ["2027-06-18", "Juneteenth falls on a Saturday"],
    ["2027-07-05", "Independence Day falls on a Sunday"],
    ["2027-12-24", "Christmas Day falls on a Saturday"],
    ["2027-12-31", "New Year's Day 2028 falls on a Saturday"],
  ])("observes %s because %s", (iso) => {
    expect(on(iso)).toBe(true);
  });

  it.each(["2026-09-29", "2026-11-10", "2027-01-19", "2027-12-27"])("%s is an ordinary day", (iso) => {
    expect(on(iso)).toBe(false);
  });
});
