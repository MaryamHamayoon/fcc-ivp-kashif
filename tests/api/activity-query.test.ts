// @vitest-environment node
import { ActivityFeedQuery, ActivityFeedResponse, parseActivityFeedQuery } from "@/lib/api/schemas";

const parse = (query: string) => parseActivityFeedQuery(new URLSearchParams(query));

describe("activity feed query normalization", () => {
  it("lands on the defaults from a bare link", () => {
    const parsed = parse("q=&kind=&scope=&when=&sort=");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ scope: "all", sort: "newest", page: 1, pageSize: 50 });
    expect(parsed.data?.kind).toBeUndefined();
    expect(parsed.data?.when).toBeUndefined();
  });

  it("accepts several kinds and statuses, comma-separated or repeated", () => {
    expect(parse("kind=note,call").data?.kind).toEqual(["note", "call"]);
    expect(parse("kind=note&kind=email_in").data?.kind).toEqual(["note", "email_in"]);
    expect(parse("status=confirmed,on_hold").data?.status).toEqual(["confirmed", "on_hold"]);
  });

  it("keeps every filter the toolbar writes", () => {
    const parsed = parse("scope=open&q=agenda&kind=email_out&waitingOn=visitor&authorId=usr_priya&regionId=af&fy=2026&status=developing&when=30d&sort=oldest&page=3&pageSize=25");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ scope: "open", q: "agenda", kind: ["email_out"], waitingOn: "visitor", authorId: "usr_priya", regionId: "af", fy: 2026, status: ["developing"], when: "30d", sort: "oldest", page: 3, pageSize: 25 });
  });

  it("takes a week only as the date of a Monday-style key", () => {
    expect(parse("week=2026-08-24").data?.week).toBe("2026-08-24");
    expect(parse("week=last-week").success).toBe(false);
    expect(parse("week=2026-8-24").success).toBe(false);
  });

  it("rejects what it does not know rather than guessing", () => {
    expect(parse("scope=everything").success).toBe(false);
    expect(parse("kind=note,telegram").success).toBe(false);
    expect(parse("waitingOn=none").success).toBe(false); // "nobody" is the absence of the filter
    expect(parse("when=yesterday").success).toBe(false);
    expect(parse("sort=loudest").success).toBe(false);
  });

  it("caps the page size", () => {
    expect(parse("pageSize=500").success).toBe(false);
    expect(ActivityFeedQuery.parse({ pageSize: 100 }).pageSize).toBe(100);
  });
});

describe("activity feed response", () => {
  it("revives dates after a JSON round trip", () => {
    const wire = JSON.parse(
      JSON.stringify({
        items: [
          {
            id: "act_1",
            kind: "email_out",
            body: "Sent the draft agenda.",
            occurredAt: new Date("2026-08-28T15:00:00Z"),
            authorId: "usr_priya",
            authorName: "Priya Raman",
            waitingOn: "visitor",
            waitingOnLabel: "ARTCI POC",
            nextAction: "Confirm the delegation list",
            nextActionDueAt: new Date("2026-09-04T15:00:00Z"),
            resolvedAt: null,
            resolvedByName: null,
            meetingId: "mtg_1",
            meetingCode: "IVP-2026-041",
            meetingTitle: "ARTCI study visit",
            meetingStatus: "developing",
            orgName: "ARTCI",
            countryCode: "CI",
            countryName: "Côte d'Ivoire",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 50,
        counts: { all: 1, open: 1, mine: 0 },
        pulse: [{ week: "2026-08-24", count: 1 }],
      }),
    );
    const body = ActivityFeedResponse.parse(wire);
    expect(body.items[0]?.occurredAt).toBeInstanceOf(Date);
    expect(body.items[0]?.nextActionDueAt).toBeInstanceOf(Date);
    expect(body.items[0]?.resolvedAt).toBeNull();
  });
});
