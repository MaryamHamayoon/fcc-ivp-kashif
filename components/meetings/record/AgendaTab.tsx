"use client";

import { CalendarPlus, ListOrdered, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/common/Avatar";
import { buttonVariants } from "@/components/ui/button";
import { formatDateNY } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { AgendaItemForm, type AgendaItem } from "./AgendaItemForm";
import { Panel } from "./Panel";
import { ActionError, formatDuration, useRecordAction, type CreateRecordAction, type RecordAction } from "./tab-actions";

/**
 * The run of show. Blocks are drafted here and circulated as the agenda document, which is why
 * the empty state points at readiness: the ring counts the *final agenda on file*, and this is
 * where that file gets written.
 */
export function AgendaTab({
  record,
  upsertAgendaItem,
  deleteAgendaItem,
}: {
  record: MeetingRecord;
  upsertAgendaItem: CreateRecordAction;
  deleteAgendaItem: RecordAction;
}) {
  const { run, pending, error } = useRecordAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const canUpdate = record.permissions.update;
  const items = [...record.agendaItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const topics = record.topics.map((t) => ({ id: t.topic.id, name: t.topic.name }));
  const briefers = record.experts.filter((e) => e.status === "confirmed").map((e) => ({ staffId: e.staffId, name: e.staff.name }));
  const staffNames = new Map(record.experts.map((e) => [e.staffId, e.staff.name]));

  const totalMinutes = items.reduce((sum, item) => (item.startsAt && item.endsAt ? sum + Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000) : sum), 0);

  return (
    <Panel
      id="agenda-heading"
      eyebrow={items.length === 0 ? "Nothing scheduled yet" : `${items.length} ${items.length === 1 ? "block" : "blocks"}`}
      title="Agenda"
      action={
        <div className="flex items-center gap-3">
          {totalMinutes > 0 ? <span className="numeric text-xs text-muted-foreground">{formatDuration(totalMinutes)} planned</span> : null}
          {canUpdate && !adding ? (
            <button type="button" onClick={() => setAdding(true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <CalendarPlus aria-hidden />
              Add block
            </button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ActionError message={error} />

        {items.length === 0 && !adding ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-10 text-center">
            <span className="mb-3 inline-flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ListOrdered className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium">No agenda yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Build the day here in timed blocks, each with its topic and briefer. The agenda you circulate becomes the final agenda on file — one of the six readiness checks.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col">
            {items.map((item, index) =>
              editing === item.id ? (
                <li key={item.id} className="py-2">
                  <AgendaItemForm
                    meetingId={record.id}
                    item={item}
                    topics={topics}
                    briefers={briefers}
                    upsertAgendaItem={upsertAgendaItem}
                    onDone={() => setEditing(null)}
                    onCancel={() => setEditing(null)}
                  />
                </li>
              ) : (
                <AgendaRow
                  key={item.id}
                  item={item}
                  index={index}
                  topicName={topics.find((t) => t.id === item.topicId)?.name ?? null}
                  brieferNames={item.brieferStaffIds.map((id) => staffNames.get(id) ?? "Unknown briefer")}
                  canUpdate={canUpdate}
                  pending={pending}
                  onEdit={() => setEditing(item.id)}
                  onDelete={() => run(() => deleteAgendaItem({ meetingId: record.id, id: item.id }), { success: "Agenda block removed." })}
                />
              ),
            )}
          </ol>
        )}

        {adding ? (
          <AgendaItemForm
            meetingId={record.id}
            topics={topics}
            briefers={briefers}
            upsertAgendaItem={upsertAgendaItem}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        ) : null}
      </div>
    </Panel>
  );
}

/** A block reads as a strip of time first: the clock is what a briefer scans for. */
function AgendaRow({
  item,
  index,
  topicName,
  brieferNames,
  canUpdate,
  pending,
  onEdit,
  onDelete,
}: {
  item: AgendaItem;
  index: number;
  topicName: string | null;
  brieferNames: string[];
  canUpdate: boolean;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const minutes = item.startsAt && item.endsAt ? Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000) : null;

  return (
    <li className={cn("flex items-start gap-4 border-l-2 border-border py-3 pl-4", index === 0 && "pt-0")}>
      <div className="w-24 shrink-0">
        <p className="numeric text-sm font-medium text-foreground">{item.startsAt ? formatDateNY(item.startsAt, "time") : "Untimed"}</p>
        <p className="numeric text-xs text-muted-foreground">
          {item.endsAt ? `to ${formatDateNY(item.endsAt, "time")}` : ""}
          {minutes !== null ? ` · ${formatDuration(minutes)}` : ""}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{item.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {topicName ? <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground/80">{topicName}</span> : null}
          {brieferNames.length > 0 ? (
            <span className="flex items-center gap-1.5">
              {brieferNames.map((name) => (
                <UserAvatar key={name} name={name} size="xs" decorative />
              ))}
              {brieferNames.join(", ")}
            </span>
          ) : (
            <span>No briefer named</span>
          )}
        </p>
        {item.notes ? <p className="mt-1 text-xs text-foreground/80">{item.notes}</p> : null}
      </div>

      {canUpdate ? (
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" aria-label={`Edit ${item.title}`} onClick={onEdit} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <Pencil aria-hidden />
          </button>
          <button type="button" disabled={pending} aria-label={`Delete ${item.title}`} onClick={onDelete} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <Trash2 aria-hidden />
          </button>
        </div>
      ) : null}
    </li>
  );
}
