"use client";

import { AlertTriangle, ArrowUpRight, CopyPlus, Download, Ellipsis, Eye, RefreshCw, SearchX, Star, StarOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, useRef } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Flag } from "@/components/common/Flag";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { downloadHref } from "@/lib/documents/href";
import { formatDateNY, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocumentGlyph, fileLine } from "./DocumentGlyph";

/* --------------------------------- columns -------------------------------- */

const COLUMNS: { id: string; header: string; headClass?: string }[] = [
  { id: "document", header: "Document", headClass: "w-[26rem]" },
  { id: "type", header: "Type", headClass: "w-32" },
  { id: "topics", header: "Topics", headClass: "w-52" },
  { id: "meeting", header: "Meeting", headClass: "w-60" },
  { id: "added", header: "Added", headClass: "w-36" },
  { id: "reusable", header: "Reusable", headClass: "w-24" },
  { id: "actions", header: "", headClass: "w-12" },
];

const CELL = "border-b px-3 py-2 align-top";

const dash = <span className="text-muted-foreground">—</span>;

/** Everything the shelf can do to one row; the workspace decides what each one means. */
export type LibraryRowHandlers = {
  /** `opener` is the control focus returns to when the drawer closes. */
  onOpen: (id: string, opener: HTMLElement) => void;
  onReuse: (item: DocumentLibraryItem) => void;
  onToggleStar: (item: DocumentLibraryItem) => void;
  onRemove: (item: DocumentLibraryItem) => void;
};

function Row({ item, canManage, onOpen, onReuse, onToggleStar, onRemove }: { item: DocumentLibraryItem; canManage: boolean } & LibraryRowHandlers) {
  const titleRef = useRef<HTMLButtonElement>(null);
  const hasFile = item.storageScheme === "blob" || item.storageScheme === "seed";
  const secondLine = [fileLine(item), item.sourceMeetingCode ? `Reused from ${item.sourceMeetingCode}` : null].filter(Boolean).join(" · ");
  const shownTopics = item.topics.slice(0, 2);
  const moreTopics = item.topics.slice(2);

  function openFromRow(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    if ((event.target as HTMLElement).closest("a, button, input, [role='button'], [role='menu']")) return;
    if (window.getSelection()?.toString()) return;
    onOpen(item.id, titleRef.current ?? event.currentTarget);
  }

  const openFromMenu = () => onOpen(item.id, titleRef.current ?? document.body);

  return (
    <tr onClick={openFromRow} className={cn("group/row cursor-pointer transition-colors hover:bg-muted/50 focus-within:bg-muted/50", !item.isCurrent && "text-muted-foreground")}>
      <td className={CELL}>
        <div className="flex items-start gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
            <DocumentGlyph mime={item.mime} scheme={item.storageScheme} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <button
                ref={titleRef}
                type="button"
                onClick={(event) => onOpen(item.id, event.currentTarget)}
                className={cn("min-w-0 truncate rounded-sm text-left font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", item.isCurrent && "text-foreground")}
              >
                {item.title}
              </button>
              {item.version > 1 ? (
                <span title={item.isCurrent ? `Version ${item.version}` : `Version ${item.version} — superseded`} className="shrink-0 rounded bg-muted px-1 text-[0.625rem] font-semibold text-muted-foreground tabular-nums">
                  v{item.version}
                </span>
              ) : null}
            </span>
            <span className="block truncate text-[0.6875rem] text-muted-foreground">{secondLine}</span>
          </span>
        </div>
      </td>

      <td className={cn(CELL, "whitespace-nowrap")}>{item.kindLabel}</td>

      <td className={CELL}>
        {shownTopics.length === 0 ? (
          dash
        ) : (
          <span className="flex items-center gap-1">
            {shownTopics.map((topic) => (
              <span key={topic.id} className="max-w-28 truncate rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                {topic.name}
              </span>
            ))}
            {moreTopics.length > 0 ? (
              <span title={moreTopics.map((topic) => topic.name).join(", ")} className="shrink-0 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
                +{moreTopics.length}
              </span>
            ) : null}
          </span>
        )}
      </td>

      <td className={CELL}>
        <Link href={`/meetings/${item.meetingId}`} className="group/meeting flex items-start gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Flag code={item.countryCode} size={12} className="mt-1" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground">{item.countryName}</span>
            <span className="block truncate text-[0.6875rem] text-muted-foreground">
              <span className="numeric group-hover/meeting:text-primary">{item.meetingCode}</span> · {item.orgShortName ?? item.orgName}
            </span>
          </span>
        </Link>
      </td>

      <td className={CELL}>
        <time dateTime={item.addedAt.toISOString()} title={formatDateNY(item.addedAt, "full")} className="block whitespace-nowrap">
          {formatDateNY(item.addedAt, "short")}
        </time>
        <span className="block truncate text-[0.6875rem] text-muted-foreground">{item.addedByName ?? "—"}</span>
      </td>

      <td className={cn(CELL, "whitespace-nowrap")}>
        {item.reusable ? (
          <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-primary">
            <Star aria-hidden className="size-3 fill-primary" />
            Reusable
          </span>
        ) : (
          dash
        )}
      </td>

      <td className={cn(CELL, "pr-2 text-right")}>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${item.title}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-xs" }), "text-muted-foreground opacity-60 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100")}
          >
            <Ellipsis aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={openFromMenu}>
              <Eye aria-hidden />
              Open
            </DropdownMenuItem>
            {hasFile ? (
              <DropdownMenuItem render={<a href={downloadHref(item.id, true)} />}>
                <Download aria-hidden />
                Download
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem render={<Link href={`/meetings/${item.meetingId}`} />}>
              <ArrowUpRight aria-hidden />
              View meeting
            </DropdownMenuItem>
            {canManage ? (
              <>
                <DropdownMenuSeparator />
                {hasFile ? (
                  <DropdownMenuItem onClick={() => onReuse(item)}>
                    <CopyPlus aria-hidden />
                    Reuse in a meeting…
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onClick={() => onToggleStar(item)}>
                  {item.reusable ? <StarOff aria-hidden /> : <Star aria-hidden />}
                  {item.reusable ? "Unstar" : "Star"}
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => onRemove(item)}>
                  <Trash2 aria-hidden />
                  Remove
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

/* ---------------------------------- table --------------------------------- */

export type LibraryTableProps = LibraryRowHandlers & {
  items: DocumentLibraryItem[];
  total: number;
  canManage: (item: DocumentLibraryItem) => boolean;
  isLoading?: boolean;
  isError?: boolean;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onRetry?: () => void;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  className?: string;
};

/**
 * The shelf itself: one row per document, newest first unless the toolbar says otherwise.
 * A row opens the drawer; the meeting cell is a link; the kebab holds everything else.
 * How many matched is the toolbar's to announce; a live region here would read it twice.
 */
export function LibraryTable({
  items,
  total,
  canManage,
  onOpen,
  onReuse,
  onToggleStar,
  onRemove,
  isLoading = false,
  isError = false,
  hasFilters = false,
  onClearFilters,
  onRetry,
  canLoadMore = false,
  onLoadMore,
  className,
}: LibraryTableProps) {
  const handlers: LibraryRowHandlers = { onOpen, onReuse, onToggleStar, onRemove };

  return (
    <section aria-label="Documents" aria-busy={isLoading || undefined} className={cn("relative overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      {isError ? (
        <EmptyState
          icon={AlertTriangle}
          className="rounded-none border-0 bg-transparent"
          title="The library did not load."
          description="The connection dropped or the server is busy. Nothing has been lost — try again."
          action={
            onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw aria-hidden />
                Try again
              </Button>
            ) : null
          }
        />
      ) : !isLoading && items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="rounded-none border-0 bg-transparent"
          title="Nothing on file matches."
          description={hasFilters ? "Clear a filter, or upload on a meeting's Documents tab." : "Nothing has been filed yet. Upload on a meeting's Documents tab."}
          action={
            hasFilters && onClearFilters ? (
              <Button type="button" variant="outline" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="relative max-h-[calc(100vh-20rem)] min-h-64 overflow-auto">
          <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-[0.8125rem]">
            <thead>
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column.id} scope="col" className={cn("sticky top-0 z-10 h-9 border-b bg-card px-3 text-left text-[0.6875rem] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase", column.headClass)}>
                    {column.header || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody aria-label="Documents">
              {isLoading && items.length === 0
                ? Array.from({ length: 6 }, (_, rowIndex) => (
                    <tr key={`skeleton-${rowIndex}`}>
                      {COLUMNS.map((column) => (
                        <td key={column.id} className={CELL}>
                          <Skeleton className="h-4 w-full max-w-40" />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map((item) => <Row key={item.id} item={item} canManage={canManage(item)} {...handlers} />)}
            </tbody>
          </table>
        </div>
      )}

      {canLoadMore && onLoadMore ? (
        <footer className="flex items-center justify-between gap-3 border-t px-3 py-2">
          <p className="numeric text-xs text-muted-foreground">
            {formatNumber(items.length)} of {formatNumber(total)} loaded
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onLoadMore} disabled={isLoading}>
            Load more
          </Button>
        </footer>
      ) : null}
    </section>
  );
}
