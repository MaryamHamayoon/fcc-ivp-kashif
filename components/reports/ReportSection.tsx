"use client";

import { Download } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { triggerDownload } from "@/lib/download";
import { cn } from "@/lib/utils";

/** One report: its heading, one sentence on what it counts, and its own CSV control. */
export function ReportSection({ id, title, description, csvHref, children, className }: { id: string; title: string; description?: ReactNode; csvHref?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("space-y-4", className)}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="heading-display text-[1.0625rem] leading-tight text-foreground">
            {title}
          </h2>
          {description ? <p className="mt-0.5 max-w-3xl text-[0.8125rem] text-muted-foreground">{description}</p> : null}
        </div>
        {csvHref ? (
          <Button type="button" variant="outline" size="sm" onClick={() => triggerDownload(csvHref)} aria-label={`Download ${title} as CSV`}>
            <Download aria-hidden />
            CSV
          </Button>
        ) : null}
      </header>
      {children}
    </section>
  );
}
