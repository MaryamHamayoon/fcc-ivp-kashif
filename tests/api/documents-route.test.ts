// @vitest-environment node
import { NextRequest } from "next/server";
import { DocumentLibraryResponse, type DocumentLibraryQueryInput } from "@/lib/api/schemas";
import type { SessionUser } from "@/lib/auth/session";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import type { PolicyUser } from "@/lib/domain/policy";
import { PolicyError } from "@/lib/services/errors";
import { makeLibraryItem } from "@/tests/fixtures/documents";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  list: vi.fn<(db: unknown, q: DocumentLibraryQueryInput, actor: PolicyUser) => Promise<{ items: DocumentLibraryItem[]; total: number }>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/services/library", () => ({ listLibrary: h.list }));

const { GET } = await import("@/app/api/documents/route");

const coordinator: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya@fcc.gov", role: "coordinator", regionIds: ["af"], staffId: "stf_priya", bureauCode: "OIA" };
const expert: SessionUser = { id: "usr_tomas", name: "Tomas Lindqvist", email: "tomas@fcc.gov", role: "expert", regionIds: [], staffId: "stf_tomas", bureauCode: "SB" };

const call = (query = "") => GET(new NextRequest(`http://localhost/api/documents${query}`));

beforeEach(() => {
  h.user = coordinator;
  h.list.mockReset();
  h.list.mockResolvedValue({ items: [], total: 0 });
});

describe("GET /api/documents", () => {
  it("refuses without a session", async () => {
    h.user = null;
    expect((await call()).status).toBe(401);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("answers 422 when the query is not valid", async () => {
    expect((await call("?sort=nonsense")).status).toBe(422);
    expect(h.list).not.toHaveBeenCalled();
  });

  it("lists with the parsed query, echoes the page and pageSize, and returns a parseable payload", async () => {
    h.list.mockResolvedValue({ items: [makeLibraryItem()], total: 212 });
    const res = await call("?kind=briefing_deck&status=confirmed,clearance&reusable=true&pageSize=100");
    expect(res.status).toBe(200);

    const [, query, actor] = h.list.mock.calls[0]!;
    expect(query).toMatchObject({ kind: "briefing_deck", status: ["confirmed", "clearance"], reusable: true, pageSize: 100, page: 1 });
    expect(actor).toMatchObject({ id: "usr_priya", role: "coordinator" });

    const body = DocumentLibraryResponse.parse(await res.json());
    expect(body).toMatchObject({ total: 212, page: 1, pageSize: 100 });
    expect(body.items[0]?.addedAt).toBeInstanceOf(Date);
    expect(body.items[0]?.scheduledStart).toBeInstanceOf(Date);
  });

  it("hands an expert's identity to the service, which narrows the shelf", async () => {
    h.user = expert;
    await call();
    expect(h.list.mock.calls[0]?.[2]).toMatchObject({ role: "expert", staffId: "stf_tomas" });
  });

  it("turns a policy refusal into 403", async () => {
    h.list.mockRejectedValue(new PolicyError());
    expect((await call()).status).toBe(403);
  });
});
