// @vitest-environment node
import { NextRequest } from "next/server";
import { MeetingListResponse, parseMeetingListQuery, type MeetingListQueryInput } from "@/lib/api/schemas";
import type { SessionUser } from "@/lib/auth/session";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import type { ReadableScope } from "@/lib/domain/policy";
import { makeListItem } from "@/tests/fixtures/meetings";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  list: vi.fn<(q: MeetingListQueryInput, scope: ReadableScope, now: Date) => Promise<{ items: MeetingListItem[]; total: number }>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/db/repos/meetings", () => ({ makeMeetingsRepo: () => ({ list: h.list }) }));

const { GET } = await import("@/app/api/meetings/route");

const coordinator: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya@fcc.gov", role: "coordinator", regionIds: ["af"], staffId: "stf_priya", bureauCode: "OIA" };
const expert: SessionUser = { id: "usr_tomas", name: "Tomas Lindqvist", email: "tomas@fcc.gov", role: "expert", regionIds: [], staffId: "stf_tomas", bureauCode: "SB" };

const call = (query = "") => GET(new NextRequest(`http://localhost/api/meetings${query}`));

beforeEach(() => {
  h.user = coordinator;
  h.list.mockClear();
  h.list.mockResolvedValue({ items: [], total: 0 });
});

describe("meeting list query normalization", () => {
  const parse = (query: string) => parseMeetingListQuery(new URLSearchParams(query));

  it("accepts a comma-separated status list", () => {
    const parsed = parse("status=confirmed,clearance");
    expect(parsed.success).toBe(true);
    expect(parsed.data?.status).toEqual(["confirmed", "clearance"]);
  });

  it("accepts repeated status parameters and trims stray whitespace", () => {
    expect(parse("status=confirmed&status=%20on_hold").data?.status).toEqual(["confirmed", "on_hold"]);
  });

  it("ignores empty parameters so a bare link still lands on the defaults", () => {
    const parsed = parse("q=&countryCode=&fy=&status=&view=");
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ view: "active", sort: "date", dir: "asc", page: 1, pageSize: 25 });
    expect(parsed.data?.status).toBeUndefined();
    expect(parsed.data?.q).toBeUndefined();
  });

  it("pages in twenty-fives unless the link says otherwise, the size the meetings page shows", () => {
    expect(parse("").data).toMatchObject({ page: 1, pageSize: 25 });
    expect(parse("pageSize=100&page=2").data).toMatchObject({ page: 2, pageSize: 100 });
  });

  it("keeps the filters a saved view sets", () => {
    expect(parse("view=completed&fy=2026&och=true&waiting=visitor&countryCode=ZA").data).toMatchObject({ view: "completed", fy: 2026, och: true, waiting: "visitor", countryCode: "ZA" });
  });

  it("rejects a status that is not part of the lifecycle", () => {
    expect(parse("status=confirmed,not_a_status").success).toBe(false);
  });
});

describe("GET /api/meetings", () => {
  it("refuses without a session", async () => {
    h.user = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("answers 422 when the query is not valid", async () => {
    const res = await call("?sort=nonsense");
    expect(res.status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("lists with the parsed query, echoes the page and pageSize, and returns a parseable payload", async () => {
    h.list.mockResolvedValue({ items: [makeListItem()], total: 128 });
    const res = await call("?status=confirmed,clearance&pageSize=100");
    expect(res.status).toBe(200);

    const [query, scope] = h.list.mock.calls[0] ?? [];
    expect(query).toMatchObject({ status: ["confirmed", "clearance"], pageSize: 100, page: 1 });
    expect(scope).toEqual({ all: true });

    const body = MeetingListResponse.parse(await res.json());
    expect(body).toMatchObject({ total: 128, page: 1, pageSize: 100 });
    expect(body.items[0]?.scheduledStart).toBeInstanceOf(Date);
    expect(body.items[0]?.updatedAt).toBeInstanceOf(Date);
    expect(body.items[0]?.readiness.percent).toBe(100);
  });

  it("narrows the readable scope for an expert to their own briefings", async () => {
    h.user = expert;
    await call();
    expect(h.list.mock.calls[0]?.[1]).toEqual({ staffId: "stf_tomas" });
  });
});
