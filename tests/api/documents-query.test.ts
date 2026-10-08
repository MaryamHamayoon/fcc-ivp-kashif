// @vitest-environment node
import { DocumentLibraryQuery, DocumentLibraryResponse, parseDocumentLibraryQuery, ReuseInput, UploadFields } from "@/lib/api/schemas";

const parse = (query: string) => parseDocumentLibraryQuery(new URLSearchParams(query));

describe("document library query normalization", () => {
  it("lands on the defaults from a bare link", () => {
    const parsed = parse("q=&kind=&fy=&status=&sort=");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ sort: "newest", page: 1, pageSize: 50 });
    expect(parsed.data?.q).toBeUndefined();
    expect(parsed.data?.status).toBeUndefined();
  });

  it("accepts comma-separated and repeated statuses", () => {
    expect(parse("status=confirmed,clearance").data?.status).toEqual(["confirmed", "clearance"]);
    expect(parse("status=confirmed&status=%20on_hold").data?.status).toEqual(["confirmed", "on_hold"]);
  });

  it("keeps every filter the toolbar writes", () => {
    const parsed = parse("kind=briefing_deck&topicId=spectrum-sharing&countryCode=ci&regionId=af&fy=2026&reusable=true&orgId=org_1&sort=title&page=2&pageSize=100");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ kind: "briefing_deck", topicId: "spectrum-sharing", countryCode: "CI", regionId: "af", fy: 2026, reusable: true, orgId: "org_1", sort: "title", page: 2, pageSize: 100 });
  });

  it("rejects a sort or kind it does not know", () => {
    expect(parse("sort=nonsense").success).toBe(false);
    expect(parse("kind=poster").success).toBe(false);
    expect(parse("status=confirmed,not_a_status").success).toBe(false);
  });

  it("caps the page size", () => {
    expect(parse("pageSize=500").success).toBe(false);
    expect(DocumentLibraryQuery.parse({ pageSize: 200 }).pageSize).toBe(200);
  });
});

describe("upload and reuse inputs", () => {
  it("defaults the star to off and trims the title", () => {
    const fields = UploadFields.parse({ meetingId: "mtg_1", kind: "readout", title: "  Readout  " });
    expect(fields).toEqual({ meetingId: "mtg_1", kind: "readout", title: "Readout", reusable: false });
    expect(UploadFields.parse({ meetingId: "mtg_1", kind: "readout", reusable: "true" }).reusable).toBe(true);
    expect(UploadFields.safeParse({ meetingId: "", kind: "readout" }).success).toBe(false);
  });

  it("lets the slot kind default to the source's", () => {
    expect(ReuseInput.parse({ sourceId: "doc_1", meetingId: "mtg_2" }).kind).toBeUndefined();
    expect(ReuseInput.parse({ sourceId: "doc_1", meetingId: "mtg_2", kind: "other" }).kind).toBe("other");
  });
});

describe("library response", () => {
  it("revives dates after a JSON round trip", () => {
    const body = DocumentLibraryResponse.parse({
      items: [
        {
          id: "doc_1",
          meetingId: "mtg_1",
          meetingCode: "IVP-2026-001",
          meetingTitle: "Visit",
          meetingStatus: "confirmed",
          scheduledStart: "2026-09-10T14:00:00.000Z",
          countryCode: "CI",
          countryName: "Côte d'Ivoire",
          regionId: "af",
          regionName: "Africa",
          orgId: "org_1",
          orgName: "ARTCI",
          orgShortName: "ARTCI",
          fiscalYear: 2026,
          kind: "briefing_deck",
          kindLabel: "Briefing Deck",
          title: "Deck",
          filename: "deck.pdf",
          mime: "application/pdf",
          size: 1200,
          version: 1,
          isCurrent: true,
          reusable: true,
          sourceDocumentId: null,
          sourceMeetingCode: null,
          sourceMeetingId: null,
          topics: [{ id: "t", name: "T" }],
          addedAt: "2026-08-01T10:00:00.000Z",
          addedByName: "Priya Raman",
          preview: "pdf",
          storageScheme: "seed",
          link: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    });
    expect(body.items[0]!.addedAt).toBeInstanceOf(Date);
    expect(body.items[0]!.scheduledStart).toBeInstanceOf(Date);
  });
});
