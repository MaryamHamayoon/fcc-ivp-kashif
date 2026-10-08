"use client";

import { useId } from "react";
import { EXPERT_STATUS_LABELS } from "@/lib/domain/types";
import { ExpertRow, type ExpertAssignment } from "./ExpertRow";
import { ActionError, useRecordAction, type RecordAction } from "./tab-actions";

/**
 * The FCC side of the room, grouped the way OIA actually chases it: by bureau. One office
 * owns the answer for everyone under it, so a coordinator reads this list top to bottom and
 * knows exactly which front office to call — and how long that office has had the ask.
 */

type Group = { key: string; label: string; sublabel: string | null; experts: ExpertAssignment[] };

function groupByBureau(experts: ExpertAssignment[]): Group[] {
  const groups = new Map<string, Group>();
  for (const expert of experts) {
    const code = expert.bureauCode ?? expert.staff.bureauCode ?? "";
    const key = code || "unassigned";
    const label = expert.staff.bureau?.name ?? (code || "No bureau on file");
    let group = groups.get(key);
    if (!group) {
      group = { key, label, sublabel: code || null, experts: [] };
      groups.set(key, group);
    }
    group.experts.push(expert);
  }
  // Alphabetical by bureau; within a bureau, the order they were added to the meeting.
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, "en"));
}

const summarize = (experts: ExpertAssignment[]): string => {
  const counts = new Map<string, number>();
  for (const e of experts) counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
  return [...counts.entries()].map(([status, n]) => `${n} ${EXPERT_STATUS_LABELS[status as ExpertAssignment["status"]].toLowerCase()}`).join(" · ");
};

export function ExpertsByBureau({
  meetingId,
  experts,
  now,
  canUpdate,
  canRespond,
  requestExpert,
  respondExpert,
  removeExpert,
}: {
  meetingId: string;
  experts: ExpertAssignment[];
  /** The record's single "now", so every age on the page agrees. */
  now: Date;
  canUpdate: boolean;
  /** Answering a briefing request — an expert may do this without being able to edit anything else. */
  canRespond: boolean;
  requestExpert: RecordAction;
  respondExpert: RecordAction;
  removeExpert: RecordAction;
}) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const groups = groupByBureau(experts);

  if (experts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        No FCC experts on this meeting yet. Add the bureau staff who will brief this delegation — the readiness ring stays short a check until one of them confirms.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ActionError message={error} />

      {groups.map((group) => (
        <section key={group.key} role="group" aria-labelledby={`${ids}-${group.key}`}>
          <div className="flex items-baseline justify-between gap-3 border-b pb-1.5">
            <h3 id={`${ids}-${group.key}`} className="text-sm font-semibold text-foreground">
              {group.label}
              {group.sublabel ? <span className="numeric ml-2 text-xs font-medium text-muted-foreground">{group.sublabel}</span> : null}
            </h3>
            <span className="text-xs text-muted-foreground">{summarize(group.experts)}</span>
          </div>

          <ul className="divide-y divide-border/60">
            {group.experts.map((expert) => (
              <ExpertRow
                key={expert.id}
                expert={expert}
                now={now}
                canUpdate={canUpdate}
                canRespond={canRespond}
                pending={pending}
                onRequest={(target) => run(() => requestExpert({ meetingId, id: target.id }), { success: `Briefing request sent to ${target.staff.name}.` })}
                onRespond={(target, status) =>
                  run(() => respondExpert({ meetingId, meetingExpertId: target.id, status }), {
                    success: `${target.staff.name} ${status === "confirmed" ? "confirmed" : "declined"}.`,
                  })
                }
                onRemove={(target) => run(() => removeExpert({ meetingId, id: target.id }), { success: `${target.staff.name} removed from this meeting.` })}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
