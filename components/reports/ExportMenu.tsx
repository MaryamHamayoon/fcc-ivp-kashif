"use client";

import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { REPORT_LABELS, type ReportId } from "@/lib/api/schemas";
import { fyLabel } from "@/lib/domain/glance";
import { triggerDownload } from "@/lib/download";
import { briefPdfHref, exportHref } from "@/lib/reports/href";

/** The three ways a report leaves the app, each under the filters on screen. */
export function ExportMenu({ params, report, fy }: { params: URLSearchParams; report: ReportId; fy: number }) {
  const items = [
    { id: "xlsx", icon: FileSpreadsheet, label: "Excel workbook", hint: "Every report, one sheet each", href: exportHref(params, "xlsx") },
    { id: "csv", icon: Download, label: "CSV of this report", hint: REPORT_LABELS[report], href: exportHref(params, "csv", report) },
    { id: "brief", icon: FileText, label: "Executive brief (PDF)", hint: `${fyLabel(fy)} one-pager`, href: briefPdfHref(fy) },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "default", size: "sm" })}>
        Export
        <ChevronDown aria-hidden className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {items.map((item) => (
          <DropdownMenuItem key={item.id} onClick={() => triggerDownload(item.href)} className="items-start gap-2.5 py-2">
            <item.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{item.label}</span>
              <span className="text-[0.6875rem] text-muted-foreground">{item.hint}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
