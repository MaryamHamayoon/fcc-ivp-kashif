// @vitest-environment node
import { addBusinessDays, businessDaysBetween } from "@/lib/domain/business-days";

describe("business days", () => {
  it("counts Monday–Friday only, exclusive of the start day", () => {
    expect(businessDaysBetween(new Date("2026-08-06T12:00:00Z"), new Date("2026-08-29T12:00:00Z"))).toBe(16); // Thu → Sat
    expect(businessDaysBetween(new Date("2026-08-28T12:00:00Z"), new Date("2026-08-31T12:00:00Z"))).toBe(1); // Fri → Mon
    expect(businessDaysBetween(new Date("2026-08-24T12:00:00Z"), new Date("2026-08-28T12:00:00Z"))).toBe(4); // Mon → Fri
    expect(businessDaysBetween(new Date("2026-08-29T12:00:00Z"), new Date("2026-08-29T12:00:00Z"))).toBe(0);
    expect(businessDaysBetween(new Date("2026-08-30T12:00:00Z"), new Date("2026-08-29T12:00:00Z"))).toBe(0);
  });

  it("adds business days, skipping weekends", () => {
    expect(addBusinessDays(new Date("2026-08-28T12:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-08-31");
    expect(addBusinessDays(new Date("2026-08-26T12:00:00Z"), 5).toISOString().slice(0, 10)).toBe("2026-09-02");
    expect(addBusinessDays(new Date("2026-08-26T12:00:00Z"), 0).toISOString()).toBe("2026-08-26T12:00:00.000Z");
  });

  it("subtracts business days when the count is negative", () => {
    expect(addBusinessDays(new Date("2026-08-31T12:00:00Z"), -1).toISOString().slice(0, 10)).toBe("2026-08-28"); // Mon → Fri
    expect(addBusinessDays(new Date("2026-08-29T12:00:00Z"), -5).toISOString().slice(0, 10)).toBe("2026-08-24"); // Sat → Mon
    expect(businessDaysBetween(addBusinessDays(new Date("2026-08-28T12:00:00Z"), -25), new Date("2026-08-28T12:00:00Z"))).toBe(25); // round trip from a weekday
  });
});
