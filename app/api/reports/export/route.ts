import { type NextRequest, NextResponse } from "next/server";
import { parseExportQuery } from "@/lib/api/schemas";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { fyLabel } from "@/lib/domain/glance";
import { CSV_BOM, tableToCsv } from "@/lib/reports/csv";
import { isoDate, type ReportTable, tableFor, trackerTable } from "@/lib/reports/tables";
import { buildTableWorkbook, buildWorkbook } from "@/lib/reports/xlsx";
import { isAppError } from "@/lib/services/errors";
import { buildReports, describeFilters, loadHistory, loadReportDataset, reportOptions } from "@/lib/services/reports";

/**
 * GET /api/reports/export?as=xlsx|csv&report=<id>&fy=&…filters
 *
 * The same query the reports page reads, so what is downloaded is what was on screen. `xlsx`
 * writes the whole workbook, every report on its own sheet; `csv` writes the one report named.
 * `report=history` with a country or an organization is a dossier's every-year tracker.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_TYPE = "text/csv; charset=utf-8";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to export a report." }, { status: 401 });

  const parsed = parseExportQuery(request.nextUrl.searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Those export options are not valid." }, { status: 422 });
  const query = parsed.data;
  const actor = toPolicyUser(user);
  const now = new Date();
  const day = isoDate(now)!;

  try {
    const db = await getDb();

    if (query.report === "history") {
      const subject = query.countryCode ? { countryCode: query.countryCode } : query.orgId ? { orgId: query.orgId } : null;
      if (!subject) return NextResponse.json({ error: "Say which country or organization to export." }, { status: 422 });
      const meetings = await loadHistory(db, subject, actor, now);
      const table = { ...trackerTable(meetings), name: "Meetings" };
      const stem = `ivp-history-${slug(query.countryCode ?? query.orgId!)}-${day}`;
      if (query.as === "csv") return csvResponse(table, stem);
      return xlsxResponse(await buildTableWorkbook([table], now), stem);
    }

    const report = query.report;
    const ds = await loadReportDataset(db, { ...query, report }, actor, now);
    const built = buildReports(ds, query.rows, query.measure);
    if (query.as === "csv") return csvResponse(tableFor(report, built, ds), `ivp-${report}-${fyLabel(ds.fy)}-${day}`);

    const options = await reportOptions(db, actor, now);
    const bytes = await buildWorkbook(built, ds, { fyLabel: fyLabel(ds.fy), generatedAt: now, filtersSentence: describeFilters(ds.filters, options) });
    return xlsxResponse(bytes, `ivp-reports-${fyLabel(ds.fy)}-${day}`);
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** File names stay plain ASCII: ids and codes only, anything else becomes a dash. */
const slug = (text: string) => text.replace(/[^A-Za-z0-9_-]+/g, "-");

function fileResponse(body: string | ArrayBuffer, type: string, filename: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const csvResponse = (table: ReportTable, stem: string) => fileResponse(CSV_BOM + tableToCsv(table), CSV_TYPE, `${stem}.csv`);

function xlsxResponse(bytes: Uint8Array, stem: string) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return fileResponse(buffer, XLSX_TYPE, `${stem}.xlsx`);
}
