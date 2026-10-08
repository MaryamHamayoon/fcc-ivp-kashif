"use client";

import type { DragEvent, ReactNode } from "react";
import { useId } from "react";
import { STATUS_DOT } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type BoardColumnProps = {
  status: MeetingStatus;
  count: number;
  /** True while a card is over this column and the drop would be accepted. */
  over: boolean;
  /** False while a card is being dragged that this column cannot take. */
  droppable: boolean;
  isLoading?: boolean;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  children: ReactNode;
};

/**
 * One status, one column. The header is the tally; the body is the queue. A column that
 * cannot take the card in flight dims rather than disappears, so the board never rearranges
 * itself under the pointer.
 */
export function BoardColumn({ status, count, over, droppable, isLoading = false, onDragOver, onDragLeave, onDrop, children }: BoardColumnProps) {
  const headingId = useId();
  const empty = count === 0;

  return (
    <section
      aria-labelledby={headingId}
      data-status={status}
      data-over={over || undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/25 transition-[background-color,box-shadow,opacity] duration-200 ease-out motion-reduce:transition-none",
        over && "bg-primary/5 ring-2 ring-primary/45 ring-inset",
        !droppable && "opacity-45",
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span aria-hidden className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
        <h3 id={headingId} className="text-[0.8125rem] font-semibold tracking-tight">
          {STATUS_LABELS[status]}
        </h3>
        <span className="numeric ml-auto rounded-full bg-card px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground ring-1 ring-border ring-inset">{count}</span>
      </header>

      <div className="relative flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <ul className="grid gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index} className="rounded-xl border bg-card p-2.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-2.5 h-3 w-24" />
              </li>
            ))}
          </ul>
        ) : (
          <>
            <ul aria-label={`${STATUS_LABELS[status]} meetings`} className="grid gap-2">
              {children}
            </ul>
            {empty ? (
              <p
                className={cn(
                  "flex min-h-24 items-center justify-center rounded-xl border border-dashed px-3 text-center text-xs text-muted-foreground transition-colors",
                  over && "border-primary/50 text-primary",
                )}
              >
                Drop a meeting here
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
