"use client";

import { MessageSquare } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/EmptyState";
import { type ActivityActionResult, type ActivityEntryView, isOpenWait, type LogActivityAction, type ResolveActivityAction } from "./activity-entries";
import { ActivityComposer, type ComposerDraft } from "./ActivityComposer";
import { ActivityFilters, type ActivityFilter, isFiltered, NO_FILTER } from "./ActivityFilters";
import { ActivityTimeline } from "./ActivityTimeline";
import { Panel } from "./Panel";

/** An optimistic entry is a real one until the server answers; only its id gives it away. */
type Patch = { op: "add"; entry: ActivityEntryView } | { op: "resolve"; id: string; at: Date };

function apply(entries: ActivityEntryView[], patch: Patch): ActivityEntryView[] {
  if (patch.op === "add") return [patch.entry, ...entries];
  return entries.map((entry) => (entry.id === patch.id ? { ...entry, resolvedAt: patch.at } : entry));
}

function matches(entry: ActivityEntryView, filter: ActivityFilter): boolean {
  if (filter.kind !== "all" && entry.kind !== filter.kind) return false;
  if (filter.waitingOn !== "all" && entry.waitingOn !== filter.waitingOn) return false;
  if (filter.unresolvedOnly && !isOpenWait(entry)) return false;
  return true;
}

const FAILED_LOG = "The entry could not be saved. Try again, and tell us if it keeps failing.";
const FAILED_RESOLVE = "That entry could not be resolved. Try again, and tell us if it keeps failing.";

export type ActivityTabProps = {
  meetingId: string;
  entries: ActivityEntryView[];
  /** The activity the record is currently waiting on — the rail's "Resolve" link lands on it. */
  waitingActivityId: string | null;
  /** `permissions.logActivity`: without it the composer and the Resolve buttons are absent, not disabled. */
  canLog: boolean;
  now: Date;
  log: LogActivityAction;
  resolve: ResolveActivityAction;
};

/**
 * The Activity tab: compose at the top, read the story below.
 *
 * Posting is optimistic — the entry appears the instant it is typed and stays while the
 * server writes it. React reverts the optimistic list when the transition ends, so a refusal
 * removes the entry on its own and the toast explains why; a success is replaced in place by
 * the revalidated record.
 */
export function ActivityTab({ meetingId, entries, waitingActivityId, canLog, now, log, resolve }: ActivityTabProps) {
  const [shown, patch] = useOptimistic(entries, apply);
  const [filter, setFilter] = useState<ActivityFilter>(NO_FILTER);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /** Runs the server action inside the transition that keeps the optimistic patch alive. */
  function commit(next: Patch, call: () => Promise<ActivityActionResult>, fallback: string): Promise<boolean> {
    return new Promise((done) => {
      startTransition(async () => {
        patch(next);
        try {
          const result = await call();
          if (!result.ok) toast.error(result.error);
          done(result.ok);
        } catch {
          toast.error(fallback);
          done(false);
        }
      });
    });
  }

  function onSubmit(draft: ComposerDraft): Promise<boolean> {
    const id = `opt_${Date.now()}`;
    setRevealId(id);
    const entry: ActivityEntryView = {
      id,
      kind: draft.kind,
      body: draft.body,
      occurredAt: new Date(),
      authorName: "You",
      waitingOn: draft.waitingOn,
      waitingOnLabel: draft.waitingOnLabel ?? null,
      nextAction: draft.nextAction ?? null,
      nextActionDueAt: draft.nextActionDueAt ? new Date(draft.nextActionDueAt) : null,
      resolvedAt: null,
      resolvedByName: null,
    };
    return commit({ op: "add", entry }, () => log({ meetingId, ...draft }), FAILED_LOG);
  }

  function onResolve(entryId: string, note: string): Promise<boolean> {
    return commit({ op: "resolve", id: entryId, at: new Date() }, () => resolve({ meetingId, activityId: entryId, note: note === "" ? undefined : note }), FAILED_RESOLVE);
  }

  const visible = shown.filter((entry) => matches(entry, filter));

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {canLog ? (
        <div id="composer" className="scroll-mt-28">
          <Panel id="composer-heading" eyebrow="Capture once" title="Log activity">
            <ActivityComposer onSubmit={onSubmit} />
          </Panel>
        </div>
      ) : null}

      <Panel id="activity-heading" eyebrow="Every move, in order" title="Activity log">
        {entries.length === 0 && shown.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Nothing logged yet" description="The first note starts the story — every tally, age and report on this meeting is derived from what is written here." />
        ) : (
          <>
            <ActivityFilters value={filter} onChange={setFilter} shown={visible.length} total={shown.length} className="mb-4" />
            {visible.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No entries match {isFiltered(filter) ? "these filters" : "this view"}.</p>
            ) : (
              <ActivityTimeline entries={visible} now={now} canResolve={canLog} onResolve={onResolve} waitingActivityId={waitingActivityId} revealId={revealId} />
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
