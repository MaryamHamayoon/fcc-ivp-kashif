"use client";

import Link from "next/link";
import { REPORT_LABELS, REPORTS, type ReportId } from "@/lib/api/schemas";
import { reportsHref } from "@/lib/reports/href";
import { cn } from "@/lib/utils";

/** The seven reports, as links that keep the filters — the record's tab idiom, not a tablist. */
export function ReportTabs({ params, active, className }: { params: URLSearchParams; active: ReportId; className?: string }) {
  return (
    <nav aria-label="Reports" className={cn("-mb-px overflow-x-auto overflow-y-hidden border-b", className)}>
      <ul className="flex min-w-max items-center gap-1">
        {REPORTS.map((id) => {
          const current = id === active;
          return (
            <li key={id}>
              <Link
                href={reportsHref(params, id)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex items-center rounded-t-lg px-3 py-2 text-[0.8125rem] font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  current ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {REPORT_LABELS[id]}
                {current ? <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
