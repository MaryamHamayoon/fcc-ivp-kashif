"use client";

import { AlertTriangle, Archive, RefreshCw, SearchX } from "lucide-react";
import { useReducedMotion } from "@/lib/motion";
import { type DragEvent, useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { allowedTransitions, canTransition, PIPELINE_ORDER, resumeTarget } from "@/lib/domain/status-machine";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import type { TransitionOutcome } from "@/lib/services/meetings";
import { cn } from "@/lib/utils";
import { BoardCard } from "./BoardCard";
import { BoardColumn } from "./BoardColumn";
import { TransitionDialog, type TransitionAction } from "./TransitionDialog";

/** The lanes work actually travels through; closed and cancelled are archive, not workflow. */
const LIVE_COLUMNS: readonly MeetingStatus[] = [...PIPELINE_ORDER.filter((status) => status !== "closed"), "on_hold"];
const ARCHIVE_COLUMNS: readonly MeetingStatus[] = ["closed", "cancelled"];

/** The guard for Confirmed and Completed, read the way the record reads it. */
export function hasAcceptedDate(meeting: MeetingListItem): boolean {
  return meeting.scheduledStart !== null || meeting.candidateDates.some((date) => date.status === "accepted");
}

export type MeetingsBoardProps = {
  items: MeetingListItem[];
  now: Date;
  /** `transitionAction` from `app/(app)/meetings/actions.ts`; injected so the board stays testable. */
  transition: TransitionAction;
  resume: (meetingId: string) => Promise<TransitionOutcome>;
  /** Called after a move lands, so the caller can refetch the list. */
  onChanged?: () => void;
  isLoading?: boolean;
  isError?: boolean;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onRetry?: () => void;
  className?: string;
};

type Dialog = { meeting: MeetingListItem; target: MeetingStatus };

/**
 * The pipeline as six lanes. Dragging a card is the fast path and the move menu is the
 * complete one — both run the same domain guards, so a move that cannot be made is
 * explained before anything is sent, and a move that can is shown immediately and only
 * rolled back if the server disagrees.
 */
export function MeetingsBoard({ items, now, transition, resume, onChanged, isLoading = false, isError = false, hasFilters = false, onClearFilters, onRetry, className }: MeetingsBoardProps) {
  const reduce = useReducedMotion() ?? false;
  const [, startTransition] = useTransition();
  const [showArchive, setShowArchive] = useState(false);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, MeetingStatus>>(new Map());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<MeetingStatus | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const columns = showArchive ? [...LIVE_COLUMNS, ...ARCHIVE_COLUMNS] : LIVE_COLUMNS;

  const grouped = useMemo(() => {
    const map = new Map<MeetingStatus, MeetingListItem[]>();
    for (const meeting of items) {
      const status = overrides.get(meeting.id) ?? meeting.status;
      const bucket = map.get(status);
      if (bucket) bucket.push(meeting);
      else map.set(status, [meeting]);
    }
    return map;
  }, [items, overrides]);

  const archived = (grouped.get("closed")?.length ?? 0) + (grouped.get("cancelled")?.length ?? 0);
  const dragged = dragId === null ? null : (items.find((meeting) => meeting.id === dragId) ?? null);

  const send = useCallback(
    (meeting: MeetingListItem, to: MeetingStatus) => {
      setOverrides((previous) => new Map(previous).set(meeting.id, to));
      setPending((previous) => new Set(previous).add(meeting.id));
      startTransition(async () => {
        const outcome = await transition({ meetingId: meeting.id, to });
        setPending((previous) => {
          const next = new Set(previous);
          next.delete(meeting.id);
          return next;
        });
        if (!outcome.ok) {
          setOverrides((previous) => {
            const next = new Map(previous);
            next.delete(meeting.id);
            return next;
          });
          toast.error(outcome.reason);
          return;
        }
        toast.success(`${meeting.code} · ${STATUS_LABELS[outcome.status ?? to]}`);
        onChanged?.();
      });
    },
    [onChanged, transition],
  );

  const lift = useCallback(
    (meeting: MeetingListItem) => {
      const back = resumeTarget(meeting.previousStatus);
      setOverrides((previous) => new Map(previous).set(meeting.id, back));
      setPending((previous) => new Set(previous).add(meeting.id));
      startTransition(async () => {
        const outcome = await resume(meeting.id);
        setPending((previous) => {
          const next = new Set(previous);
          next.delete(meeting.id);
          return next;
        });
        if (!outcome.ok) {
          setOverrides((previous) => {
            const next = new Map(previous);
            next.delete(meeting.id);
            return next;
          });
          toast.error(outcome.reason);
          return;
        }
        toast.success(`${meeting.code} · ${STATUS_LABELS[outcome.status ?? back]}`);
        onChanged?.();
      });
    },
    [onChanged, resume],
  );

  /** One decision point for both the drop and the menu: refuse, ask, or move. */
  const move = useCallback(
    (meeting: MeetingListItem, to: MeetingStatus) => {
      const from = overrides.get(meeting.id) ?? meeting.status;
      if (from === to || pending.has(meeting.id)) return;

      if (from === "on_hold") {
        const back = resumeTarget(meeting.previousStatus);
        if (to === back) lift(meeting);
        else toast.error(`${meeting.code} is on hold. Resume it to ${STATUS_LABELS[back]} first.`);
        return;
      }
      if (!allowedTransitions(from).includes(to)) {
        toast.error(`${STATUS_LABELS[from]} does not move straight to ${STATUS_LABELS[to]}.`);
        return;
      }
      // Hold and cancellation both need words on the record; the dialog collects them.
      if (to === "on_hold" || to === "cancelled") {
        setDialog({ meeting, target: to });
        return;
      }
      const verdict = canTransition(from, to, { hasAcceptedDate: hasAcceptedDate(meeting) });
      if (!verdict.ok) {
        toast.error(verdict.reason);
        return;
      }
      send(meeting, to);
    },
    [lift, overrides, pending, send],
  );

  /** Whether the card in flight could land in this column at all — drives the dimming. */
  const droppable = useCallback(
    (status: MeetingStatus) => {
      if (!dragged) return true;
      const from = overrides.get(dragged.id) ?? dragged.status;
      if (from === status) return true;
      if (from === "on_hold") return status === resumeTarget(dragged.previousStatus);
      return allowedTransitions(from).includes(status);
    },
    [dragged, overrides],
  );

  const onDragOver = useCallback(
    (status: MeetingStatus) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      setOverStatus(status);
    },
    [],
  );

  const onDrop = useCallback(
    (status: MeetingStatus) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setOverStatus(null);
      setDragId(null);
      const id = event.dataTransfer?.getData("text/plain") || dragId;
      const meeting = items.find((candidate) => candidate.id === id);
      if (meeting) move(meeting, status);
    },
    [dragId, items, move],
  );

  const body =
    isError ? (
      <EmptyState
        icon={AlertTriangle}
        title="The board did not load."
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
        title="No meetings match these filters."
        description={hasFilters ? "Widen the search, or clear the filters to see the whole program." : "Nothing has been logged for this view yet."}
        action={
          hasFilters && onClearFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null
        }
      />
    ) : (
      // The board scrolls sideways inside this box; the page never does.
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <div className="flex max-h-[calc(100dvh-21rem)] min-h-[22rem] items-stretch gap-3">
          {columns.map((status) => {
            const cards = grouped.get(status) ?? [];
            return (
              <BoardColumn
                key={status}
                status={status}
                count={isLoading ? 0 : cards.length}
                over={overStatus === status && droppable(status)}
                droppable={droppable(status)}
                isLoading={isLoading}
                onDragOver={onDragOver(status)}
                onDragLeave={() => setOverStatus((current) => (current === status ? null : current))}
                onDrop={onDrop(status)}
              >
                {cards.map((meeting, index) => (
                  <BoardCard
                    key={meeting.id}
                    meeting={meeting}
                    now={now}
                    index={index}
                    reduce={reduce}
                    dragging={dragId === meeting.id}
                    pending={pending.has(meeting.id)}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", meeting.id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragId(meeting.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStatus(null);
                    }}
                    onMove={(to) => move(meeting, to)}
                    onResume={() => lift(meeting)}
                  />
                ))}
              </BoardColumn>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className={cn("space-y-3", className)}>
      {isError || (!isLoading && items.length === 0) ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p aria-live="polite" className="text-xs text-muted-foreground">
            {isLoading ? "Loading meetings…" : "Drag a card to move it, or use its menu — the same rules apply either way."}
          </p>
          <Button type="button" variant="ghost" size="sm" aria-pressed={showArchive} onClick={() => setShowArchive((current) => !current)} className={cn(showArchive && "bg-muted text-foreground")}>
            <Archive aria-hidden />
            Show closed &amp; cancelled
            {showArchive ? <span className="numeric text-[0.6875rem] text-muted-foreground">{archived}</span> : null}
          </Button>
        </div>
      )}

      {body}

      {dialog ? (
        <TransitionDialog
          meetingId={dialog.meeting.id}
          code={dialog.meeting.code}
          status={overrides.get(dialog.meeting.id) ?? dialog.meeting.status}
          hasAcceptedDate={hasAcceptedDate(dialog.meeting)}
          target={dialog.target}
          action={transition}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onDone={(status) => {
            setOverrides((previous) => new Map(previous).set(dialog.meeting.id, status));
            setDialog(null);
            onChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}
