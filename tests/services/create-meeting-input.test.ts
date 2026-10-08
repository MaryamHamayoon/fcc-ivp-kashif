// @vitest-environment node
import { CreateMeetingInput, type CreateMeetingInputRaw } from "@/lib/api/schemas";

const full: CreateMeetingInputRaw = {
  requestor: {
    name: "Kouassi Mensah",
    title: "Director General",
    organizationName: "ARTCI",
    organizationKind: "regulator",
    email: "k.mensah@artci.example",
    phone: "+225 27 20 34 43 75",
    viaIntermediary: "Embassy of Côte d'Ivoire",
  },
  countryCodes: ["CI", "SN"],
  regionId: "af",
  leadUserId: "usr_priya",
  delegation: {
    headline: "Spectrum sharing study visit",
    purpose: "Compare CBRS-style sharing frameworks before drafting national rules.",
    size: 6,
    members: [
      { name: "Awa Traoré", title: "Head of Spectrum" },
      { name: "Lucie Bamba", category: "other", isInterpreter: true },
    ],
  },
  topics: [{ topicId: "spectrum-sharing", detail: "How is the three-tier model enforced?" }, { topicId: "spectrum-auctions" }],
  dates: {
    preferredStart: "2026-11-04T15:00:00Z",
    preferredEnd: "2026-11-04T17:00:00Z",
    alternateStart: "2026-11-11T15:00:00Z",
    format: "in_person",
  },
  logistics: { needsAv: true, interpreter: "consecutive", accommodations: "Step-free access", localContact: "Embassy duty officer", backgroundUrl: "https://artci.example/visit" },
  ochRequested: true,
};

/** A minimal request: everything the intake wizard can legitimately leave blank is left blank. */
const minimal: CreateMeetingInputRaw = {
  requestor: { name: "Ana Souza", organizationName: "Agência Nova", organizationKind: "ministry", email: "ana@nova.example" },
  countryCodes: ["BR"],
  regionId: "wha",
  delegation: { headline: "Broadband mapping exchange", size: 3 },
  topics: [{ topicId: "broadband-mapping" }],
  dates: { preferredStart: "2026-11-04T15:00:00Z", format: "virtual" },
};

describe("CreateMeetingInput", () => {
  it("accepts a fully specified request and coerces the dates", () => {
    const parsed = CreateMeetingInput.parse(full);
    expect(parsed.requestor.organizationKind).toBe("regulator");
    expect(parsed.countryCodes).toEqual(["CI", "SN"]);
    expect(parsed.dates.preferredStart).toBeInstanceOf(Date);
    expect(parsed.dates.preferredStart.toISOString()).toBe("2026-11-04T15:00:00.000Z");
    expect(parsed.dates.alternateStart?.toISOString()).toBe("2026-11-11T15:00:00.000Z");
    expect(parsed.delegation.members).toHaveLength(2);
    expect(parsed.delegation.members[0]).toMatchObject({ name: "Awa Traoré", category: "foreign_gov", isInterpreter: false });
    expect(parsed.delegation.members[1]).toMatchObject({ category: "other", isInterpreter: true });
    expect(parsed.topics[0]?.detail).toBe("How is the three-tier model enforced?");
    expect(parsed.logistics.backgroundUrl).toBe("https://artci.example/visit");
    expect(parsed.ochRequested).toBe(true);
  });

  it("fills in the defaults a blank wizard field implies", () => {
    const parsed = CreateMeetingInput.parse(minimal);
    expect(parsed.dates.timezone).toBe("America/New_York");
    expect(parsed.delegation.members).toEqual([]);
    expect(parsed.logistics).toMatchObject({ needsAv: false, interpreter: "none" });
    expect(parsed.ochRequested).toBe(false);
    expect(parsed.leadUserId).toBeUndefined();
  });

  it("rejects a request with no country", () => {
    const result = CreateMeetingInput.safeParse({ ...minimal, countryCodes: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "countryCodes")).toBe(true);
  });

  it("rejects a request with no topic", () => {
    const result = CreateMeetingInput.safeParse({ ...minimal, topics: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "topics")).toBe(true);
  });

  it("rejects an alternate date that falls before the preferred date", () => {
    const result = CreateMeetingInput.safeParse({
      ...minimal,
      dates: { preferredStart: "2026-11-04T15:00:00Z", alternateStart: "2026-10-28T15:00:00Z", format: "virtual" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "dates.alternateStart")).toBe(true);
  });

  it("rejects an end that falls before the start", () => {
    const result = CreateMeetingInput.safeParse({
      ...minimal,
      dates: { preferredStart: "2026-11-04T15:00:00Z", preferredEnd: "2026-11-04T09:00:00Z", format: "virtual" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.path.join(".") === "dates.preferredEnd")).toBe(true);
  });

  it("rejects a malformed requestor email and an over-large delegation", () => {
    const bad = CreateMeetingInput.safeParse({ ...minimal, requestor: { ...minimal.requestor, email: "not-an-email" } });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.some((i) => i.path.join(".") === "requestor.email")).toBe(true);

    const huge = CreateMeetingInput.safeParse({ ...minimal, delegation: { headline: "Big visit", size: 200 } });
    expect(huge.success).toBe(false);
    expect(huge.error?.issues.some((i) => i.path.join(".") === "delegation.size")).toBe(true);
  });
});
