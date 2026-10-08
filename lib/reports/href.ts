/** The one-page executive brief for a fiscal year, as a PDF; the palette, the reports page and the brief page all point here. */
export function briefPdfHref(fy: number): string {
  return `/api/reports/brief?fy=${fy}`;
}

/** The query keys a report is read from — what the tabs, the exports and the brief carry along. */
export const REPORT_QUERY_KEYS = ["fy", "regionId", "countryCode", "topicId", "format", "bureauCode", "status", "leadUserId", "rows", "measure"] as const;

function reportQuery(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of REPORT_QUERY_KEYS) for (const value of params.getAll(key)) if (value) next.append(key, value);
  return next;
}

/** The reports page showing `report` under the same filters. */
export function reportsHref(params: URLSearchParams, report: string): string {
  const next = reportQuery(params);
  if (report !== "summary") next.set("report", report);
  const query = next.toString();
  return query ? `/reports?${query}` : "/reports";
}

/** The export route: the whole workbook, or one report as CSV, under the same filters. */
export function exportHref(params: URLSearchParams, as: "xlsx" | "csv", report?: string): string {
  const next = reportQuery(params);
  next.set("as", as);
  if (report) next.set("report", report);
  return `/api/reports/export?${next.toString()}`;
}

/** A dossier's every-year tracker as a file: a country's or an organization's whole history. */
export function historyExportHref(subject: { countryCode?: string; orgId?: string }, as: "xlsx" | "csv" = "xlsx"): string {
  const next = new URLSearchParams({ report: "history" });
  if (subject.countryCode) next.set("countryCode", subject.countryCode);
  else if (subject.orgId) next.set("orgId", subject.orgId);
  next.set("as", as);
  return `/api/reports/export?${next.toString()}`;
}
