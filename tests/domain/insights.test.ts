// @vitest-environment node
import { formatShares, OTHER_COUNTRIES, regionTopicFlows, topicFlows, type TopicFlows } from "@/lib/domain/insights";
import type { TallyMeeting } from "@/lib/domain/tallies";

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

describe("formatShares", () => {
  const thisYear = [
    tm({ id: "1", format: "virtual", participantTotal: 8 }),
    tm({ id: "2", format: "virtual", participantTotal: 6 }),
    tm({ id: "3", format: "virtual", participantTotal: 4 }),
    tm({ id: "4", format: "in_person", participantTotal: 12 }),
  ];
  const lastYear = [tm({ id: "a", format: "virtual" }), tm({ id: "b", format: "in_person" }), tm({ id: "c", format: "in_person" }), tm({ id: "d", format: "hybrid" })];

  it("gives each format its meetings, participants and share of the year, largest first", () => {
    const rows = formatShares(thisYear, []);
    expect(rows.map((r) => [r.key, r.label, r.count, r.participants, r.share])).toEqual([
      ["virtual", "Virtual", 3, 18, 0.75],
      ["in_person", "In person", 1, 12, 0.25],
    ]);
  });

  it("measures the move against last year in percentage points", () => {
    const rows = formatShares(thisYear, lastYear);
    // Virtual went from 1 of 4 (25%) to 3 of 4 (75%); in person from 2 of 4 (50%) to 1 of 4 (25%).
    expect(rows.find((r) => r.key === "virtual")).toMatchObject({ priorShare: 0.25, deltaPoints: 50 });
    expect(rows.find((r) => r.key === "in_person")).toMatchObject({ priorShare: 0.5, deltaPoints: -25 });
  });

  it("keeps a format that was used last year and not this one, so its disappearance is visible", () => {
    const hybrid = formatShares(thisYear, lastYear).find((r) => r.key === "hybrid");
    expect(hybrid).toMatchObject({ count: 0, share: 0, priorShare: 0.25, deltaPoints: -25 });
  });

  it("has no comparison to offer when last year is empty", () => {
    for (const row of formatShares(thisYear, [])) {
      expect(row.priorShare).toBeNull();
      expect(row.deltaPoints).toBeNull();
    }
  });

  it("returns nothing, rather than shares of zero, for a year with no meetings at all", () => {
    expect(formatShares([], [])).toEqual([]);
  });
});

describe("topicFlows", () => {
  const meetings = [
    tm({ id: "1", regionName: "Africa", topics: ["Spectrum", "Broadband"] }),
    tm({ id: "2", regionName: "Africa", topics: ["Spectrum"] }),
    tm({ id: "3", regionName: "Europe", topics: ["Spectrum", "Satellite"] }),
    tm({ id: "4", regionName: "Europe", topics: ["Broadband"] }),
    tm({ id: "5", regionName: "Americas", topics: ["Accessibility"] }),
    tm({ id: "6", regionName: "Americas", topics: [] }),
  ];

  /** Distinct per-meeting countries, for the drill-down fields. */
  const countryMeetings = [
    tm({ id: "c1", regionName: "Africa", countryName: "Kenya", countryCode: "KE", topics: ["Spectrum", "Broadband"] }),
    tm({ id: "c2", regionName: "Africa", countryName: "Kenya", countryCode: "KE", topics: ["Spectrum"] }),
    tm({ id: "c3", regionName: "Africa", countryName: "Nigeria", countryCode: "NG", topics: ["Broadband"] }),
    tm({ id: "c4", regionName: "Africa", countryName: "Ghana", countryCode: "GH", topics: ["Broadband"] }),
    tm({ id: "c5", regionName: "Europe", countryName: "Germany", countryCode: "DE", topics: ["Spectrum", "Satellite"] }),
    tm({ id: "c6", regionName: "Europe", countryName: "France", countryCode: "FR", topics: ["Spectrum"] }),
  ];

  it("ranks the topics by the meetings that took them up, and keeps only the top few", () => {
    const flows = topicFlows(meetings, 2);
    expect(flows.topics).toEqual([
      { key: "Spectrum", label: "Spectrum", meetings: 3 },
      { key: "Broadband", label: "Broadband", meetings: 2 },
    ]);
    // Satellite and Accessibility exist but fall outside the top two.
    expect(flows.otherTopics).toBe(2);
  });

  it("links each region to each topic it raised, counting meetings", () => {
    const flows = topicFlows(meetings, 2);
    expect(flows.links).toEqual([
      { region: "Africa", topic: "Spectrum", count: 2 },
      { region: "Africa", topic: "Broadband", count: 1 },
      { region: "Europe", topic: "Spectrum", count: 1 },
      { region: "Europe", topic: "Broadband", count: 1 },
    ]);
  });

  it("sizes a region by the topics it raised, and also says how many meetings that was", () => {
    const flows = topicFlows(meetings, 2);
    expect(flows.regions).toEqual([
      // Africa: meetings 1 and 2 raised Spectrum, Broadband, Spectrum.
      { key: "Africa", label: "Africa", meetings: 2, mentions: 3 },
      // Europe: meeting 3 raised Spectrum (Satellite is not shown), meeting 4 raised Broadband.
      { key: "Europe", label: "Europe", meetings: 2, mentions: 2 },
    ]);
  });

  it("leaves out a region whose meetings raised none of the topics shown", () => {
    expect(topicFlows(meetings, 2).regions.map((r) => r.key)).not.toContain("Americas");
  });

  it("balances: every link is counted once on each side", () => {
    const flows = topicFlows(meetings, 8);
    const linked = flows.links.reduce((sum, l) => sum + l.count, 0);
    expect(flows.regions.reduce((sum, r) => sum + r.mentions, 0)).toBe(linked);
    expect(flows.topics.reduce((sum, t) => sum + t.meetings, 0)).toBe(linked);
  });

  it("is empty for a year in which no meeting named a topic", () => {
    expect(topicFlows([tm({ id: "1", topics: [] })], 8)).toEqual({
      topics: [],
      regions: [],
      links: [],
      countries: [],
      countryLinks: [],
      otherTopics: 0,
    });
  });

  it("lists each region's countries, most mentioned first, ties broken by name", () => {
    const flows = topicFlows(countryMeetings, 2);
    // Spectrum (4) and Broadband (3) are the top two; Satellite (1) falls outside them.
    expect(flows.countries).toEqual([
      { key: "KE", label: "Kenya", region: "Africa", meetings: 2, mentions: 3 },
      { key: "GH", label: "Ghana", region: "Africa", meetings: 1, mentions: 1 },
      { key: "NG", label: "Nigeria", region: "Africa", meetings: 1, mentions: 1 },
      { key: "FR", label: "France", region: "Europe", meetings: 1, mentions: 1 },
      { key: "DE", label: "Germany", region: "Europe", meetings: 1, mentions: 1 },
    ]);
  });

  it("links each region's country to each topic it raised, ordered as the countries then the topics", () => {
    const flows = topicFlows(countryMeetings, 2);
    expect(flows.countryLinks).toEqual([
      { region: "Africa", country: "KE", topic: "Spectrum", count: 2 },
      { region: "Africa", country: "KE", topic: "Broadband", count: 1 },
      { region: "Africa", country: "GH", topic: "Broadband", count: 1 },
      { region: "Africa", country: "NG", topic: "Broadband", count: 1 },
      { region: "Europe", country: "FR", topic: "Spectrum", count: 1 },
      { region: "Europe", country: "DE", topic: "Spectrum", count: 1 },
    ]);
  });

  it("keeps a country that meets under two regions as two separate rows", () => {
    const flows = topicFlows(
      [
        tm({ id: "g1", regionName: "Europe", countryName: "Switzerland", countryCode: "CH", topics: ["Spectrum"] }),
        tm({ id: "g2", regionName: "Multilateral & International Organizations", countryName: "Switzerland", countryCode: "CH", topics: ["Spectrum"] }),
      ],
      8,
    );
    expect(flows.countries).toEqual([
      { key: "CH", label: "Switzerland", region: "Europe", meetings: 1, mentions: 1 },
      { key: "CH", label: "Switzerland", region: "Multilateral & International Organizations", meetings: 1, mentions: 1 },
    ]);
  });

  it("adds no country row for a meeting that raised only topics outside the top few", () => {
    const flows = topicFlows([...meetings, tm({ id: "7", regionName: "Asia-Pacific", countryName: "Japan", countryCode: "JP", topics: ["Satellite"] })], 2);
    expect(flows.countries.some((c) => c.key === "JP")).toBe(false);
    expect(flows.regions.some((r) => r.key === "Asia-Pacific")).toBe(false);
  });

  it("balances the country breakdown against the region totals, on a fuller fixture", () => {
    const flows = topicFlows(countryMeetings, 8);
    for (const region of flows.regions) {
      const countrySum = flows.countries.filter((c) => c.region === region.key).reduce((sum, c) => sum + c.mentions, 0);
      expect(countrySum).toBe(region.mentions);
    }
    for (const link of flows.links) {
      const countryLinkSum = flows.countryLinks
        .filter((cl) => cl.region === link.region && cl.topic === link.topic)
        .reduce((sum, cl) => sum + cl.count, 0);
      expect(countryLinkSum).toBe(link.count);
    }
  });
});

describe("regionTopicFlows", () => {
  const flows: TopicFlows = {
    topics: [
      { key: "Spectrum", label: "Spectrum", meetings: 20 },
      { key: "Satellite", label: "Satellite", meetings: 2 },
      { key: "Broadband", label: "Broadband", meetings: 3 },
    ],
    regions: [{ key: "Africa", label: "Africa", meetings: 6, mentions: 9 }],
    links: [
      { region: "Africa", topic: "Spectrum", count: 6 },
      { region: "Africa", topic: "Broadband", count: 3 },
    ],
    countries: [
      { key: "KE", label: "Kenya", region: "Africa", meetings: 3, mentions: 4 },
      { key: "NG", label: "Nigeria", region: "Africa", meetings: 2, mentions: 3 },
      { key: "GH", label: "Ghana", region: "Africa", meetings: 1, mentions: 2 },
    ],
    countryLinks: [
      { region: "Africa", country: "KE", topic: "Spectrum", count: 3 },
      { region: "Africa", country: "KE", topic: "Broadband", count: 1 },
      { region: "Africa", country: "NG", topic: "Spectrum", count: 2 },
      { region: "Africa", country: "NG", topic: "Broadband", count: 1 },
      { region: "Africa", country: "GH", topic: "Spectrum", count: 1 },
      { region: "Africa", country: "GH", topic: "Broadband", count: 1 },
    ],
    otherTopics: 0,
  };

  it("returns null for a region the flows never raised", () => {
    expect(regionTopicFlows(flows, "Europe", 3)).toBeNull();
  });

  it("keeps only the topics the region raised, re-counted within it, in the chart's own order", () => {
    const drilled = regionTopicFlows(flows, "Africa", 3);
    // Satellite is a top-level topic but Africa never raised it, so it drops out; Spectrum's
    // region count (6) differs from its global figure (20) to prove this is the region's own tally.
    expect(drilled?.topics).toEqual([
      { key: "Spectrum", label: "Spectrum", meetings: 6 },
      { key: "Broadband", label: "Broadband", meetings: 3 },
    ]);
  });

  it("gives every country its own row when there are exactly as many as fit", () => {
    const drilled = regionTopicFlows(flows, "Africa", 3);
    expect(drilled?.countries).toEqual([
      { key: "KE", label: "Kenya", code: "KE", meetings: 3, mentions: 4 },
      { key: "NG", label: "Nigeria", code: "NG", meetings: 2, mentions: 3 },
      { key: "GH", label: "Ghana", code: "GH", meetings: 1, mentions: 2 },
    ]);
    expect(drilled?.folded).toBe(0);
  });

  it("folds the smallest countries into one trailing row once there are more than fit", () => {
    const drilled = regionTopicFlows(flows, "Africa", 2);
    expect(drilled?.countries).toEqual([
      { key: "KE", label: "Kenya", code: "KE", meetings: 3, mentions: 4 },
      { key: OTHER_COUNTRIES, label: "2 other countries", code: null, meetings: 3, mentions: 5 },
    ]);
    expect(drilled?.folded).toBe(2);
    expect(drilled?.links).toEqual([
      { country: "KE", topic: "Spectrum", count: 3 },
      { country: "KE", topic: "Broadband", count: 1 },
      { country: OTHER_COUNTRIES, topic: "Spectrum", count: 3 },
      { country: OTHER_COUNTRIES, topic: "Broadband", count: 2 },
    ]);
  });

  it("balances after folding: every count still lands somewhere", () => {
    const drilled = regionTopicFlows(flows, "Africa", 2);
    const linked = drilled?.links.reduce((sum, l) => sum + l.count, 0) ?? 0;
    expect(drilled?.countries.reduce((sum, c) => sum + c.mentions, 0)).toBe(linked);
    expect(drilled?.topics.reduce((sum, t) => sum + t.meetings, 0)).toBe(linked);
  });
});
