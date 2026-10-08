// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { renderBriefPdf } from "@/lib/reports/brief";
import { type Brief, briefFor } from "@/lib/reports/brief-data";
import { buildReports } from "@/lib/services/reports";
import { makeReportDataset } from "@/tests/fixtures/reports";

const ds = makeReportDataset();
const brief = briefFor(ds, buildReports(ds, "topic", "meetings"));

async function pages(bytes: Uint8Array) {
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  return PDFDocument.load(bytes);
}

/** Every list at its cap, every label long: the page that would spill if anything could. */
const full: Brief = {
  ...brief,
  headline: "Forty-one engagements with delegations from twenty-six countries across every region, twelve of them in the last quarter alone, and participation running ahead of the year before.",
  where: {
    countries: Array.from({ length: 6 }, (_, i) => ({ key: `c${i}`, label: `Democratic Republic of Long Country Name ${i}`, count: 12 - i })),
    regions: Array.from({ length: 6 }, (_, i) => ({ key: `r${i}`, label: `Western Hemisphere and the Caribbean ${i}`, count: 9 - i })),
  },
  what: Array.from({ length: 6 }, (_, i) => ({ key: `t${i}`, label: `Spectrum sharing and dynamic access frameworks ${i}`, count: 8 - i })),
  next: Array.from({ length: 5 }, (_, i) => ({ meetingId: `n${i}`, code: `IVP-2026-10${i}`, date: new Date(`2026-09-${10 + i}T14:00:00Z`), countryName: "Papua New Guinea", orgName: "National Information and Communications Technology Authority", status: "confirmed" as const })),
  stuck: Array.from({ length: 5 }, (_, i) => ({ meetingId: `s${i}`, code: `IVP-2026-20${i}`, title: "Regulatory exchange on submarine cable landing licence conditions and cross-border data", who: "Bureau expert", days: 14 - i })),
};

describe("renderBriefPdf", () => {
  it("renders the brief as a one-page, titled PDF", async () => {
    const pdf = await pages(await renderBriefPdf(brief));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("FY26 executive brief — International Visitors Program");
    expect(pdf.getAuthor()).toBe("FCC International Visitors Program");
    const [page] = pdf.getPages();
    expect(page!.getWidth()).toBeCloseTo(612, 0);
    expect(page!.getHeight()).toBeCloseTo(792, 0);
  }, 30_000);

  it("stays on one page with every list full and every label long", async () => {
    expect((await pages(await renderBriefPdf(full))).getPageCount()).toBe(1);
  }, 30_000);

  it("renders an empty year without a chart to draw", async () => {
    const empty = makeReportDataset({ meetings: [], priorMeetings: [], participants: [], priorParticipants: [], experts: [] });
    expect((await pages(await renderBriefPdf(briefFor(empty, buildReports(empty, "topic", "meetings"))))).getPageCount()).toBe(1);
  }, 30_000);
});
