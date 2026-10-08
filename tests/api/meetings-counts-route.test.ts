// @vitest-environment node
import { NextRequest } from "next/server";
import { MeetingCountsResponse, type MeetingListQueryInput } from "@/lib/api/schemas";
import type { SessionUser } from "@/lib/auth/session";
import type { ReadableScope } from "@/lib/domain/policy";
import type { MeetingView } from "@/lib/domain/status-machine";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  countByView: vi.fn<(q: MeetingListQueryInput, scope: ReadableScope, now: Date) => Promise<Record<MeetingView, number>>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/db/repos/meetings", () => ({ makeMeetingsRepo: () => ({ countByView: h.countByView }) }));

const { GET } = await import("@/app/api/meetings/counts/route");

const coordinator: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya@fcc.gov", role: "coordinator", regionIds: ["af"], staffId: "stf_priya", bureauCode: "OIA" };
const expert: SessionUser = { id: "usr_tomas", name: "Tomas Lindqvist", email: "tomas@fcc.gov", role: "expert", regionIds: [], staffId: "stf_tomas", bureauCode: "SB" };
const COUNTS: Record<MeetingView, number> = { active: 42, upcoming: 18, developing: 12, on_hold: 3, completed: 61, all: 120 };

const call = (query = "") => GET(new NextRequest(`http://localhost/api/meetings/counts${query}`));

beforeEach(() => {
  h.user = coordinator;
  h.countByView.mockReset();
  h.countByView.mockResolvedValue(COUNTS);
});

describe("GET /api/meetings/counts", () => {
  it("refuses without a session", async () => {
    h.user = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(h.countByView).not.toHaveBeenCalled();
  });

  it("answers 422 when the query is not valid", async () => {
    const res = await call("?status=not_a_status");
    expect(res.status).toBe(422);
    expect(h.countByView).not.toHaveBeenCalled();
  });

  it("counts under the list's own filters and returns a parseable payload", async () => {
    const res = await call("?regionId=af&status=confirmed,clearance&och=true&view=completed&sort=updated");
    expect(res.status).toBe(200);
    const [query, scope] = h.countByView.mock.calls[0] ?? [];
    expect(query).toMatchObject({ regionId: "af", status: ["confirmed", "clearance"], och: true, view: "completed" });
    expect(scope).toEqual({ all: true });
    expect(MeetingCountsResponse.parse(await res.json())).toEqual({ counts: COUNTS });
  });

  it("narrows the readable scope for an expert to their own briefings", async () => {
    h.user = expert;
    await call();
    expect(h.countByView.mock.calls[0]?.[1]).toEqual({ staffId: "stf_tomas" });
  });
});
