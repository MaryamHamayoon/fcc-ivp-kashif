"use client";

import { Loader2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { SelectField, TextAreaField, TextField } from "@/components/meetings/wizard/fields";
import { parseWallClock } from "@/components/meetings/wizard/wizard-schema";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { MeetingRecord } from "@/lib/services/record";
import { ActionError, toWallClock, useRecordAction, type CreateRecordAction } from "./tab-actions";

export type AgendaItem = MeetingRecord["agendaItems"][number];
export type AgendaTopicOption = { id: string; name: string };
export type BrieferOption = { staffId: string; name: string };

/**
 * One timed block. Topics come from what the delegation asked to discuss and briefers from the
 * experts who have confirmed, so the agenda can only be built out of commitments the record
 * already holds — there is nothing here to re-type, and nothing to get out of step.
 */
export function AgendaItemForm({
  meetingId,
  item,
  topics,
  briefers,
  upsertAgendaItem,
  onDone,
  onCancel,
}: {
  meetingId: string;
  /** Present when editing; absent when adding. */
  item?: AgendaItem;
  topics: AgendaTopicOption[];
  briefers: BrieferOption[];
  upsertAgendaItem: CreateRecordAction;
  onDone: () => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [title, setTitle] = useState(item?.title ?? "");
  const [start, setStart] = useState(toWallClock(item?.startsAt));
  const [end, setEnd] = useState(toWallClock(item?.endsAt));
  const [topicId, setTopicId] = useState(item?.topicId ?? "");
  const [chosen, setChosen] = useState<string[]>(item?.brieferStaffIds ?? []);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [attempted, setAttempted] = useState(false);

  const startAt = start.trim() === "" ? null : parseWallClock(start);
  const endAt = end.trim() === "" ? null : parseWallClock(end);
  const titleError = attempted && title.trim().length < 2 ? "Give the block a name — it is what the delegation reads." : undefined;
  const endError = attempted && startAt && endAt && endAt.getTime() <= startAt.getTime() ? "The end must come after the start." : undefined;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAttempted(true);
    if (title.trim().length < 2 || (startAt && endAt && endAt.getTime() <= startAt.getTime())) return;
    run(
      () =>
        upsertAgendaItem({
          meetingId,
          id: item?.id,
          title: title.trim(),
          startsAt: startAt ? startAt.toISOString() : null,
          endsAt: endAt ? endAt.toISOString() : null,
          topicId: topicId === "" ? null : topicId,
          brieferStaffIds: chosen,
          notes: notes.trim() === "" ? null : notes.trim(),
        }),
      { success: item ? "Agenda block updated." : "Agenda block added.", onDone },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-2xl border bg-muted/25 p-4">
      <TextField id={`${ids}-title`} label="Block" value={title} onChange={setTitle} error={titleError} placeholder="Shared spectrum access overview" />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField id={`${ids}-start`} label="Start" optional type="datetime-local" value={start} onChange={setStart} hint="Washington time" />
        <TextField id={`${ids}-end`} label="End" optional type="datetime-local" value={end} onChange={setEnd} error={endError} />
      </div>

      <SelectField id={`${ids}-topic`} label="Topic" optional value={topicId} onChange={setTopicId} placeholder="No single topic" hint="Chosen from what this delegation asked to discuss.">
        {topics.map((topic) => (
          <option key={topic.id} value={topic.id}>
            {topic.name}
          </option>
        ))}
      </SelectField>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Briefers</legend>
        {briefers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No expert has confirmed yet. Confirm a briefer on the People tab and they become selectable here.</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {briefers.map((briefer) => {
              const inputId = `${ids}-briefer-${briefer.staffId}`;
              const selected = chosen.includes(briefer.staffId);
              return (
                <li key={briefer.staffId}>
                  <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm transition-colors hover:bg-muted/50 has-data-checked:border-primary/50 has-data-checked:bg-accent/50">
                    <Checkbox
                      id={inputId}
                      checked={selected}
                      onCheckedChange={(checked) => setChosen(checked ? [...chosen, briefer.staffId] : chosen.filter((id) => id !== briefer.staffId))}
                    />
                    <span className="min-w-0 truncate">{briefer.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <TextAreaField id={`${ids}-notes`} label="Materials and notes" optional rows={2} value={notes} onChange={setNotes} placeholder="CBRS overview deck, slides 4–18. Hand out the spectrum chart." />

      <ActionError message={error} />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {item ? "Save block" : "Add block"}
        </button>
      </div>
    </form>
  );
}
