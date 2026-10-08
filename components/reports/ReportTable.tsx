"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { formatDateNY, formatNumber } from "@/lib/format";
import type { CellFormat, ReportCell, ReportTable as ReportTableData } from "@/lib/reports/tables";
import { cn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A cell as the screen shows it: counts with separators, rates as percentages, dates as Washington reads them. */
export function formatCell(value: ReportCell, format?: CellFormat): string {
  if (value === null || value === "") return "—";
  if (typeof value === "number") {
    if (format === "percent") return `${Math.round(value * 100)}%`;
    if (format === "decimal") return value.toFixed(1);
    if (format === "year") return String(value);
    return formatNumber(value);
  }
  return ISO_DATE.test(value) ? formatDateNY(`${value}T12:00:00Z`, "short") : value;
}

export type ReportTableProps = {
  table: ReportTableData;
  /** Spoken by screen readers; the visible heading belongs to the section around the table. */
  caption: string;
  /** The last row is a total, set in the table's foot on a hairline. */
  totals?: boolean;
  /** Cap the height and scroll inside, with the header pinned. */
  scroll?: boolean;
  /** A link for a row's first cell — the meeting record behind an IVP code, say. */
  linkFor?: (row: ReportCell[], index: number) => string | null;
  /** A cell rendered specially — a flag beside a country, say. Return undefined to keep the default. */
  renderCell?: (value: ReportCell, column: number, row: ReportCell[]) => ReactNode | undefined;
  /** Rows are grouped under muted subheaders whenever this changes from one row to the next. */
  groupBy?: (row: ReportCell[]) => string;
  className?: string;
};

/**
 * Dense, sticky-headed, right-aligned tabular numbers: the one table every report shares. The
 * data is the same `ReportTable` the CSV and the workbook write, so the screen and the file
 * never disagree.
 */
export function ReportTable({ table, caption, totals = false, scroll = false, linkFor, renderCell, groupBy, className }: ReportTableProps) {
  const numeric = table.columns.map((_, i) => table.rows.some((row) => typeof row[i] === "number"));
  const body = totals ? table.rows.slice(0, -1) : table.rows;
  const foot = totals ? table.rows.at(-1) : undefined;
  /** The subheader a row opens, if its group differs from the row before it. */
  const opens = body.map((row, i) => {
    const heading = groupBy?.(row) ?? null;
    const previous = i > 0 ? (groupBy?.(body[i - 1]!) ?? null) : null;
    return heading !== null && heading !== previous ? heading : null;
  });

  return (
    // A table wider or taller than its box scrolls, so the box is a named region a keyboard can
    // reach and move (WCAG 2.1.1); the caption inside it is what a screen reader announces.
    <div role="region" aria-label={caption} tabIndex={0} className={cn("relative overflow-auto rounded-xl border bg-card shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", scroll && "max-h-[70vh]", className)}>
      <table className="w-full min-w-max border-collapse text-[0.8125rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {table.columns.map((name, i) => (
              <th key={name} scope="col" className={cn("sticky top-0 z-10 h-9 border-b bg-card px-3 text-left text-[0.6875rem] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase", numeric[i] && "text-right")}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.length === 0 ? (
            <tr>
              <td colSpan={table.columns.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                Nothing to show for these filters.
              </td>
            </tr>
          ) : null}
          {body.map((row, r) => {
            const heading = opens[r] ?? null;
            return (
              <Fragment key={r}>
                {heading !== null ? (
                  <tr>
                    <td colSpan={table.columns.length} className="border-b bg-muted/40 px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      {heading}
                    </td>
                  </tr>
                ) : null}
                <tr className="border-b transition-colors last:border-b-0 hover:bg-muted/40">
                  {row.map((value, c) => {
                    const custom = renderCell?.(value, c, row);
                    const text = formatCell(value, table.formats?.[c]);
                    const href = c === 0 ? (linkFor?.(row, r) ?? null) : null;
                    return (
                      <td key={c} title={typeof value === "string" && value.length > 32 ? value : undefined} className={cn("max-w-72 truncate px-3 py-1.5 whitespace-nowrap", numeric[c] && "numeric text-right", value === null && "text-muted-foreground")}>
                        {custom ?? (href ? <Link href={href} className="font-medium text-foreground underline-offset-2 hover:underline">{text}</Link> : text)}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
        {foot ? (
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              {foot.map((value, c) => (
                <td key={c} className={cn("px-3 py-2 whitespace-nowrap", numeric[c] && "numeric text-right")}>
                  {value === null ? "" : formatCell(value, table.formats?.[c])}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
