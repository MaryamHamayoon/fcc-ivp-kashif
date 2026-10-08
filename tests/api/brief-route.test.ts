// @vitest-environment node
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { type Brief, briefFor } from "@/lib/reports/brief-data";
import { PolicyError } from "@/lib/services/errors";
import { buildReports } from "@/lib/services/reports";
import { makeReportDataset } from "@/tests/fixtures/reports";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  load: vi.fn<(...args: unknown[]) => Promise<Brief>>(),
  render: vi.fn<(...args: unknown[]) => Promise<Uint8Array>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/services/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/reports")>()),
  loadBrief: h.load,
}));
vi.mock("@/lib/reports/brief", () => ({ renderBriefPdf: h.render }));

const { GET } = await import("@/app/api/reports/brief/route");

const executive: SessionUser = { id: "usr_exec", name: "Eleanor Vance", email: "eleanor@fcc.gov", role: "executive", regionIds: [], staffId: null, bureauCode: null };
const ds = makeReportDataset();
const brief = briefFor(ds, buildReports(ds, "topic", "meetings"));
const PDF = new TextEncoder().encode("%PDF-1.7 fake");
const call = (query = "") => GET(new NextRequest(`http://localhost/api/reports/brief${query}`));

beforeEach(() => {
  h.user = executive;
  h.load.mockReset();
  h.render.mockReset();
  h.load.mockResolvedValue(brief);
  h.render.mockResolvedValue(PDF);
});

describe("GET /api/reports/brief", () => {
  it("refuses without a session", async () => {
    h.user = null;
    expect((await call("?fy=2026")).status).toBe(401);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("answers the policy's refusal as JSON", async () => {
    h.load.mockRejectedValue(new PolicyError());
    const res = await call("?fy=2026");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "You do not have permission to do that." });
    expect(h.render).not.toHaveBeenCalled();
  });

  it("rejects a year it cannot read", async () => {
    expect((await call("?fy=abc")).status).toBe(422);
    expect((await call("?fy=1999")).status).toBe(422);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("streams the year's brief as a PDF attachment nobody may cache", async () => {
    const res = await call("?fy=2026");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="ivp-executive-brief-FY26.pdf"');
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(h.load).toHaveBeenCalledWith({}, 2026, expect.objectContaining({ id: "usr_exec", role: "executive" }), expect.any(Date));
    expect(h.render).toHaveBeenCalledWith(brief);
  });

  it("briefs the current fiscal year when none is named", async () => {
    await call();
    expect(h.load.mock.calls[0]?.[1]).toBe(fiscalYearOf(new Date()));
  });

  it("says so, as JSON, when the renderer fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    h.render.mockRejectedValue(new Error("font missing"));
    const res = await call("?fy=2026");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't build the PDF." });
    quiet.mockRestore();
  });
});
