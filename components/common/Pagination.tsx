"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { pageCount, pageWindow } from "@/lib/domain/activity-feed";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const PAGE_SIZES = [25, 50, 100] as const;

const cell = "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The foot of a paged list: how many rows a page holds, which rows are on screen, and the pages
 * around this one. Pages are real links, so a page is a URL like every other piece of a list's
 * state; the row count is the one control, because it has to forget the page it was on.
 */
export function Pagination({
  page,
  pageSize,
  total,
  noun,
  hrefForPage,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Plural, lower case: "entries". */
  noun: string;
  hrefForPage: (page: number) => string;
  onPageSizeChange: (size: number) => void;
  className?: string;
}) {
  const selectId = useId();
  const pages = pageCount(total, pageSize);
  const current = Math.min(page, pages);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(total, current * pageSize);
  const sizes = PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number]) ? PAGE_SIZES : [...PAGE_SIZES, pageSize].sort((a, b) => a - b);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-3 py-2 text-xs text-muted-foreground", className)}>
      <div className="flex items-center gap-2">
        <label htmlFor={selectId}>Rows per page</label>
        <select
          id={selectId}
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="numeric h-7 rounded-md border bg-card px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-0.5">
          {current > 1 ? (
            <Link href={hrefForPage(current - 1)} scroll={false} aria-label="Previous page" className={cn(cell, "hover:bg-muted hover:text-foreground")}>
              <ChevronLeft aria-hidden className="size-3.5" />
            </Link>
          ) : (
            <span aria-hidden className={cn(cell, "opacity-35")}>
              <ChevronLeft className="size-3.5" />
            </span>
          )}
          {pageWindow(current, pages).map((entry, i) =>
            entry === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className="px-1">
                …
              </span>
            ) : (
              <Link
                key={entry}
                href={hrefForPage(entry)}
                scroll={false}
                aria-label={`Page ${entry}`}
                aria-current={entry === current ? "page" : undefined}
                className={cn(cell, "numeric", entry === current ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted hover:text-foreground")}
              >
                {formatNumber(entry)}
              </Link>
            ),
          )}
          {current < pages ? (
            <Link href={hrefForPage(current + 1)} scroll={false} aria-label="Next page" className={cn(cell, "hover:bg-muted hover:text-foreground")}>
              <ChevronRight aria-hidden className="size-3.5" />
            </Link>
          ) : (
            <span aria-hidden className={cn(cell, "opacity-35")}>
              <ChevronRight className="size-3.5" />
            </span>
          )}
        </nav>
      ) : null}

      <p className="numeric whitespace-nowrap">
        {total === 0 ? (
          `No ${noun}`
        ) : (
          <>
            <span className="font-semibold text-foreground">
              {formatNumber(first)}–{formatNumber(last)}
            </span>{" "}
            of {formatNumber(total)}
          </>
        )}
      </p>
    </div>
  );
}
