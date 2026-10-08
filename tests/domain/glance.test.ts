// @vitest-environment node
import { fyLabel, glanceHeadline } from "@/lib/domain/glance";

const base = { engagements: 46, countries: 43, participants: 425, fiscalYear: 2026, tense: "current" as const, scoped: false };

describe("fyLabel", () => {
  it("shortens a fiscal year to its two-digit label", () => {
    expect(fyLabel(2026)).toBe("FY26");
    expect(fyLabel(2025)).toBe("FY25");
    expect(fyLabel(2100)).toBe("FY00");
  });
});

describe("glanceHeadline", () => {
  it("states the year in one sentence", () => {
    expect(glanceHeadline(base)).toBe("46 engagements across 43 countries this fiscal year, reaching 425 foreign officials.");
  });

  it("uses singulars when there is exactly one of something", () => {
    expect(glanceHeadline({ ...base, engagements: 1, countries: 1, participants: 1 })).toBe("1 engagement across 1 country this fiscal year, reaching 1 foreign official.");
  });

  it("separates thousands", () => {
    expect(glanceHeadline({ ...base, engagements: 1240, countries: 118, participants: 12_805 })).toBe(
      "1,240 engagements across 118 countries this fiscal year, reaching 12,805 foreign officials.",
    );
  });

  it("names a finished fiscal year instead of calling it this one", () => {
    expect(glanceHeadline({ ...base, fiscalYear: 2025, tense: "past" })).toBe("46 engagements across 43 countries in FY25, reaching 425 foreign officials.");
  });

  it("says nothing has been counted for a year that has not started", () => {
    expect(glanceHeadline({ ...base, fiscalYear: 2027, tense: "future" })).toBe("Nothing counted yet for FY27.");
    expect(glanceHeadline({ ...base, fiscalYear: 2027, tense: "future", engagements: 0, countries: 0, participants: 0 })).toBe("Nothing counted yet for FY27.");
    expect(glanceHeadline({ ...base, fiscalYear: 2027, tense: "future", scoped: true })).toBe("Nothing counted yet for FY27.");
  });

  it("reads as an empty year when nothing is counted yet", () => {
    expect(glanceHeadline({ ...base, engagements: 0, countries: 0, participants: 0 })).toBe("No engagements counted yet this fiscal year.");
    expect(glanceHeadline({ ...base, engagements: 0, countries: 0, participants: 0, fiscalYear: 2025, tense: "past" })).toBe("No engagements counted in FY25.");
  });

  it("speaks to an expert about their own briefings", () => {
    expect(glanceHeadline({ ...base, engagements: 6, countries: 5, participants: 48, scoped: true })).toBe(
      "6 of your briefings across 5 countries this fiscal year, reaching 48 foreign officials.",
    );
    expect(glanceHeadline({ ...base, engagements: 1, countries: 1, participants: 1, scoped: true })).toBe(
      "1 of your briefings across 1 country this fiscal year, reaching 1 foreign official.",
    );
    expect(glanceHeadline({ ...base, engagements: 6, countries: 5, participants: 48, scoped: true, fiscalYear: 2025, tense: "past" })).toBe(
      "6 of your briefings across 5 countries in FY25, reaching 48 foreign officials.",
    );
  });

  it("tells an expert with nothing counted so, without sounding like the program is empty", () => {
    expect(glanceHeadline({ ...base, engagements: 0, countries: 0, participants: 0, scoped: true })).toBe("None of your briefings are counted yet this fiscal year.");
    expect(glanceHeadline({ ...base, engagements: 0, countries: 0, participants: 0, scoped: true, fiscalYear: 2025, tense: "past" })).toBe("None of your briefings were counted in FY25.");
  });
});
