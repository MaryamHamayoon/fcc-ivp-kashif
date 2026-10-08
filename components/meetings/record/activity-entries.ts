/**
 * The contract between the Activity tab's server page and its client island.
 *
 * The timeline runs on the client (filters, optimistic posting, inline resolution), so the
 * record's activity rows are flattened here into plain, serializable entries — no Drizzle
 * relations, no policy objects. This module carries no `"use client"` directive on purpose:
 * the server page calls `toActivityEntries`, the client components import the types.
 */
import type { ActivityKind, WaitingOn } from "@/lib/domain/types";
import type { MeetingRecord } from "@/lib/services/record";

export type ActivityEntryView = {
  id: string;
  kind: ActivityKind;
  body: string;
  occurredAt: Date;
  /** Display name of whoever logged it; entries the app writes for itself are authored by the system. */
  authorName: string;
  waitingOn: WaitingOn;
  /** "ARTCI POC" — who exactly, when the party alone is too vague to act on. */
  waitingOnLabel: string | null;
  nextAction: string | null;
  nextActionDueAt: Date | null;
  resolvedAt: Date | null;
  resolvedByName: string | null;
};

/** Both actions answer the same way: the id of what was written, or the reason it was not. */
export type ActivityActionResult = { ok: true; id: string } | { ok: false; error: string };

/** `logActivityAction` in `app/(app)/meetings/[id]/activity/actions.ts`; injected so the tab stays testable. */
export type LogActivityAction = (input: unknown) => Promise<ActivityActionResult>;
/** `resolveActivityAction` — closes a waiting entry, optionally logging the note that closed it. */
export type ResolveActivityAction = (input: unknown) => Promise<ActivityActionResult>;

/** Entries with nobody to chase, or already answered, never carry an age. */
export function isOpenWait(entry: ActivityEntryView): boolean {
  return entry.waitingOn !== "none" && entry.resolvedAt === null;
}

/**
 * Flattens `record.activities` for the timeline, newest first.
 *
 * The resolver is stored as an id and the detail query does not join it, so the name is
 * looked up among the people the record already knows — the lead, the coordinator and every
 * author in the log. An unknown resolver simply goes unnamed rather than showing a raw id.
 */
export function toActivityEntries(record: MeetingRecord): ActivityEntryView[] {
  const names = new Map<string, string>();
  for (const person of [record.lead, record.coordinator]) if (person) names.set(person.id, person.name);
  for (const activity of record.activities) if (activity.author) names.set(activity.author.id, activity.author.name);

  return [...record.activities]
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.seq - a.seq)
    .map((activity) => ({
      id: activity.id,
      kind: activity.kind,
      body: activity.body,
      occurredAt: activity.occurredAt,
      authorName: activity.author?.name ?? "System",
      waitingOn: activity.waitingOn,
      waitingOnLabel: activity.waitingOnLabel,
      nextAction: activity.nextAction,
      nextActionDueAt: activity.nextActionDueAt,
      resolvedAt: activity.resolvedAt,
      resolvedByName: activity.resolvedById ? (names.get(activity.resolvedById) ?? null) : null,
    }));
}
