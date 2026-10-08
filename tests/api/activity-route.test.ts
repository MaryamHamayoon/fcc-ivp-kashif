// @vitest-environment node
import { NextRequest } from "next/server";
import { type ActivityFeedQueryInput, ActivityFeedResponse } from "@/lib/api/schemas";
import type { SessionUser } from "@/lib/auth/session";
import type { PolicyUser } from "@/lib/domain/policy";
import type { ActivityFeed } from "@/lib/services/activity-feed";
import { PolicyError } from "@/lib/services/errors";
import { makeFeedItem } from "@/tests/fixtures/activity";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  list: vi.fn<(db: unknown, q: ActivityFeedQueryInput, actor: PolicyUser) => Promise<ActivityFeed>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/services/activity-feed", () => ({ listActivity: h.list }));

const { GET } = await import("@/app/api/activity/route");

const coordinator: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya@fcc.gov", role: "coordinator", regionIds: ["af"], staffId: "stf_priya", bureauCode: "OIA" };
const expert: SessionUser = { id: "usr_tomas", name: "Tomas Lindqvist", email: "tomas@fcc.gov", role: "expert", regionIds: [], staffId: "stf_tomas", bureauCode: "SB" };
const EMPTY: ActivityFeed = { items: [], total: 0, counts: { all: 0, open: 0, mine: 0 }, pulse: [] };

const call = (query = "") => GET(new NextRequest(`http://localhost/api/activity${query}`));

beforeEach(() => {
  h.user = coordinator;
  h.list.mockReset();
  h.list.mockResolvedValue(EMPTY);
});

describe("GET /api/activity", () => {
  it("refuses without a session", async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("answers 422 when the query is not valid", async () => {
    expect((await call("?scope=everything")).status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("lists with the parsed query, echoes the page, and returns a payload the client can parse", async () => {
    h.list.mockResolvedValue({ items: [makeFeedItem({ waitingOn: "visitor", nextActionDueAt: new Date("2026-09-04T15:00:00Z") })], total: 137, counts: { all: 900, open: 137, mine: 40 }, pulse: [{ week: "2026-08-24", count: 12 }] });
    const res = await call("?scope=open&kind=email_out,call&when=30d&page=2&pageSize=25");
    expect(res.status).toBe(200);

    const [, query, actor] = h.list.mock.calls[0]!;
    expect(query).toMatchObject({ scope: "open", kind: ["email_out", "call"], when: "30d", page: 2, pageSize: 25 });
    expect(actor).toMatchObject({ id: "usr_priya", role: "coordinator" });

    const body = ActivityFeedResponse.parse(await res.json());
    expect(body).toMatchObject({ total: 137, page: 2, pageSize: 25, counts: { all: 900, open: 137, mine: 40 }, pulse: [{ week: "2026-08-24", count: 12 }] });
    expect(body.items[0]?.occurredAt).toBeInstanceOf(Date);
    expect(body.items[0]?.nextActionDueAt).toBeInstanceOf(Date);
  });

  it("hands an expert's identity to the service, which narrows the log", async () => {
    h.user = expert;
    await call();
    expect(h.list.mock.calls[0]?.[2]).toMatchObject({ role: "expert", staffId: "stf_tomas" });
  });

  it("turns a policy refusal into 403", async () => {
    h.list.mockRejectedValue(new PolicyError());
    expect((await call()).status).toBe(403);
  });
});
