// @vitest-environment node
import { NextRequest } from "next/server";
import type { SessionUser } from "@/lib/auth/session";
import type { ReportDataset, ReportMeeting } from "@/lib/domain/reports";
import { trackerColumns } from "@/lib/reports/tables";
import { PolicyError } from "@/lib/services/errors";
import type { ReportOptions } from "@/lib/services/reports";
import { makeReportDataset, reportMeetings } from "@/tests/fixtures/reports";

const h = vi.hoisted(() => ({
  user: null as SessionUser | null,
  load: vi.fn<(...args: unknown[]) => Promise<ReportDataset>>(),
  history: vi.fn<(...args: unknown[]) => Promise<ReportMeeting[]>>(),
  options: vi.fn<(...args: unknown[]) => Promise<ReportOptions>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => h.user,
  toPolicyUser: (u: SessionUser) => ({ id: u.id, role: u.role, regionIds: u.regionIds, staffId: u.staffId }),
}));
vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/services/reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/reports")>()),
  loadReportDataset: h.load,
  loadHistory: h.history,
  reportOptions: h.options,
}));

const { GET } = await import("@/app/api/reports/export/route");

const coordinator: SessionUser = { id: "usr_priya", name: "Priya Raman", email: "priya@fcc.gov", role: "coordinator", regionIds: [], staffId: "stf_priya", bureauCode: null };
const options: ReportOptions = { regions: [{ value: "af", label: "Africa" }], countries: [], topics: [], bureaus: [], leads: [], fiscalYears: [2026, 2025, 2024], currentFiscalYear: 2026 };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const call = (query: string) => GET(new NextRequest(`http://localhost/api/reports/export${query}`));

/** `text()` quietly drops a byte-order mark, so read the bytes: is the mark there, and what follows it? */
async function readCsv(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { bom, text: new TextDecoder().decode(bytes.slice(bom ? 3 : 0)) };
}

beforeEach(() => {
  h.user = coordinator;
  h.load.mockReset();
  h.history.mockReset();
  h.options.mockReset();
  h.load.mockResolvedValue(makeReportDataset({ filters: { regionId: "af" } }));
  h.history.mockResolvedValue(reportMeetings);
  h.options.mockResolvedValue(options);
});

describe("GET /api/reports/export", () => {
  it("refuses without a session", async () => {
    h.user = null;
    expect((await call("")).status).toBe(401);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("answers the policy's refusal as JSON, not a file", async () => {
    h.load.mockRejectedValue(new PolicyError());
    const res = await call("?as=csv&report=tally");
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).error).toBeTruthy();
  });

  it("rejects a file type or a report it cannot write", async () => {
    expect((await call("?as=doc")).status).toBe(422);
    expect((await call("?report=nope")).status).toBe(422);
    expect(h.load).not.toHaveBeenCalled();
  });

  it("writes the whole workbook by default, named for the year and the day", async () => {
    const res = await call("?fy=2026&regionId=af");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(XLSX);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="ivp-reports-FY26-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe("PK");
    expect(h.load.mock.calls[0]![1]).toMatchObject({ fy: 2026, regionId: "af" });
    expect(h.options).toHaveBeenCalled();
  });

  it("writes one report as CSV with the byte-order mark Excel needs", async () => {
    const res = await call("?as=csv&report=tally&fy=2026");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="ivp-tally-FY26-\d{4}-\d{2}-\d{2}\.csv"$/);
    const { bom, text } = await readCsv(res);
    expect(bom).toBe(true);
    expect(text.startsWith("Month,Meetings,Countries")).toBe(true);
    expect(text).toContain("\r\nTotal,");
    expect(h.options).not.toHaveBeenCalled();
  });

  it("exports a dossier's every-year history as the tracker", async () => {
    const res = await call("?as=csv&report=history&countryCode=ke");
    expect(res.status).toBe(200);
    expect(h.history.mock.calls[0]![1]).toEqual({ countryCode: "KE" });
    expect(res.headers.get("content-disposition")).toMatch(/ivp-history-KE-\d{4}-\d{2}-\d{2}\.csv/);
    const { bom, text } = await readCsv(res);
    expect(bom).toBe(true);
    expect(text.split("\r\n")[0]).toBe(trackerColumns().map((c) => c.header).join(","));

    const xlsx = await call("?report=history&orgId=ofcom");
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toBe(XLSX);
    expect(xlsx.headers.get("content-disposition")).toMatch(/ivp-history-ofcom-\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(h.history.mock.calls[1]![1]).toEqual({ orgId: "ofcom" });
    expect(h.load).not.toHaveBeenCalled();
  });

  it("needs a country or an organization for a history", async () => {
    const res = await call("?report=history");
    expect(res.status).toBe(422);
    expect(h.history).not.toHaveBeenCalled();
  });
});
