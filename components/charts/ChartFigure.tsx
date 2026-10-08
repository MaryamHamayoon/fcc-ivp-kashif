"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { SectionBar } from "@/components/common/SectionBar";
import { Button } from "@/components/ui/button";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ChartTable = { columns: string[]; rows: (string | number)[][] };

export type ChartFigureProps = {
  title: string;
  /** The figure's icon, already drawn: `icon={<Tags />}`. */
  icon?: ReactNode;
  /** A short fact beside the title — "Top 8 of 23". The figure is not described here; see `description`. */
  note?: string;
  /** Where the title sits in the page's outline: 3 under a section's own heading, 2 where the figure is the section. */
  level?: 2 | 3;
  /** The figure's own filters and controls, set in the title bar ahead of "Show data". */
  actions?: ReactNode;
  /** Read by screen readers only — the chart itself is decorative, this carries the meaning. */
  description: string;
  /** The same numbers as the chart, for the "Show data" toggle. */
  table: ChartTable;
  children: ReactNode;
  className?: string;
};

/**
 * The accessible shell every chart renders inside: a labelled `<figure>` that opens with the
 * slim title bar — the name on the left, the figure's controls and a "Show data" toggle on the
 * right — then an sr-only description, the visual, and the identical numbers as a `<table>`
 * when asked for.
 */
export function ChartFigure({ title, icon, note, level = 3, actions, description, table, children, className }: ChartFigureProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const tableId = `${id}-table`;
  const [open, setOpen] = useState(false);

  return (
    // `relative` keeps the sr-only description from inflating the page inside a scrolling column.
    <figure aria-labelledby={titleId} className={cn("relative flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      <SectionBar as="figcaption" level={level} title={title} titleId={titleId} icon={icon} note={note}>
        {actions}
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={tableId} onClick={() => setOpen((v) => !v)} className="shrink-0 text-muted-foreground">
          {open ? "Hide data" : "Show data"}
          <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
        </Button>
      </SectionBar>
      <p className="sr-only">{description}</p>
      <div className="flex flex-1 flex-col justify-center p-5">{children}</div>
      {open ? (
        <div id={tableId} className="animate-in fade-in slide-in-from-top-1 border-t px-5 py-4 duration-300">
          {/* Owned here rather than the `Table` primitive's own wrapper, so this — not an
              unreachable inner div — is the one thing that scrolls, and a keyboard can reach it
              (WCAG 2.1.1 / axe `scrollable-region-focusable`). */}
          <div role="region" aria-label={`${title}: the numbers behind the chart`} tabIndex={0} className="relative overflow-x-auto rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <table data-slot="table" className="w-full caption-bottom text-sm">
              {/* Named in its own right: a table lifted out of context by a screen reader's table
                  list must still say which chart's numbers these are. */}
              <caption className="sr-only">{title} — the numbers behind the chart</caption>
              <TableHeader>
                <TableRow>
                  {table.columns.map((col) => (
                    <TableHead key={col}>{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j}>{cell}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
        </div>
      ) : null}
    </figure>
  );
}
