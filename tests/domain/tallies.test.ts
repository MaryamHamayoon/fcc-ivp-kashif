// @vitest-environment node
import { COUNTED_STATUSES, countBy, monthlyCadence, type TallyMeeting } from "@/lib/domain/tallies";

function tm(overrides: Partial<TallyMeeting> & { id: string }): TallyMeeting {
  return {
    fiscalYear: 2026,
    status: "closed",
    format: "virtual",
    regionName: "Africa",
    countryName: "Nigeria",
    countryCode: "NG",
    topics: ["Spectrum"],
    bureaus: ["WTB"],
    participantTotal: 10,
    scheduledStart: new Date("2026-03-10T14:00:00Z"),
    ...overrides,
  };
}

describe("tallies", () => {
  it("counts single and multi-valued keys, sorted by count then label", () => {
    const rows = countBy(
      [tm({ id: "1", topics: ["Spectrum", "AI"] }), tm({ id: "2", topics: ["Spectrum"] }), tm({ id: "3", topics: ["Satellite"] }), tm({ id: "4", topics: [] })],
      (m) => m.topics,
    );
    expect(rows).toEqual([
      { key: "Spectrum", label: "Spectrum", count: 2 },
      { key: "AI", label: "AI", count: 1 },
      { key: "Satellite", label: "Satellite", count: 1 },
    ]);
  });

  it("skips null keys and applies a label function", () => {
    const rows = countBy([tm({ id: "1", format: "virtual" }), tm({ id: "2", format: "in_person" }), tm({ id: "3", format: "virtual" })], (m) => m.format, (k) =>
      k === "in_person" ? "In person" : "Virtual",
    );
    expect(rows).toEqual([
      { key: "virtual", label: "Virtual", count: 2 },
      { key: "in_person", label: "In person", count: 1 },
    ]);
    expect(countBy([tm({ id: "1" })], () => null)).toEqual([]);
  });

  it("builds a 12-month fiscal cadence for the current and prior year", () => {
    const rows = monthlyCadence(
      [
        tm({ id: "1", status: "confirmed", scheduledStart: new Date("2025-10-15T14:00:00Z") }), // FY2026, Oct
        tm({ id: "2", status: "closed", scheduledStart: new Date("2025-10-20T14:00:00Z") }), // FY2026, Oct
        tm({ id: "3", status: "requested", scheduledStart: new Date("2025-10-22T14:00:00Z") }), // not counted
        tm({ id: "4", status: "closed", scheduledStart: new Date("2024-11-05T14:00:00Z") }), // FY2025, Nov
        tm({ id: "5", status: "completed", scheduledStart: null }), // undated
        tm({ id: "6", status: "closed", scheduledStart: new Date("2026-09-02T14:00:00Z") }), // FY2026, Sep
      ],
      2026,
    );
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.month)).toEqual(["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep"]);
    expect(rows[0]).toEqual({ month: "Oct", current: 2, prior: 0 });
    expect(rows[1]).toEqual({ month: "Nov", current: 0, prior: 1 });
    expect(rows[11]).toEqual({ month: "Sep", current: 1, prior: 0 });
    expect(COUNTED_STATUSES).toEqual(["confirmed", "completed", "closed"]);
  });
});
