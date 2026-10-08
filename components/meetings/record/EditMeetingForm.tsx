"use client";

import { ArrowDown, ArrowUp, Building2, Check, Loader2, Monitor, Plus, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useMemo, useState } from "react";
import type { z } from "zod";
import { describedBy, FieldMessages, RadioCards, SelectField, SwitchField, TextAreaField, TextField, type CardOption } from "@/components/meetings/wizard/fields";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpdateMeetingInput } from "@/lib/api/schemas";
import { FORMAT_LABELS, MEETING_FORMATS, PRIORITIES, PRIORITY_LABELS, type MeetingFormat, type Priority } from "@/lib/domain/types";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";
import { ActionError, useRecordAction, type RecordAction } from "./tab-actions";

/**
 * The request essentials, ownership and ranked topics — everything about a meeting that is not
 * a date, a person's confirmation state or a document. Saved as one action so the topic list and
 * the header fields never disagree about what "changed" means.
 */

export type EditTopicOption = { id: string; name: string; group: string };
export type EditUserOption = { id: string; name: string; title: string | null };

const FORMAT_ICONS: Record<MeetingFormat, ReactNode> = {
  in_person: <Building2 className="size-4 text-muted-foreground" aria-hidden />,
  virtual: <Monitor className="size-4 text-muted-foreground" aria-hidden />,
  hybrid: <Users className="size-4 text-muted-foreground" aria-hidden />,
};

const FORMAT_OPTIONS: readonly CardOption<MeetingFormat>[] = MEETING_FORMATS.map((format) => ({ value: format, label: FORMAT_LABELS[format], icon: FORMAT_ICONS[format] }));

const iconButton =
  "inline-flex size-7 items-center justify-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

/** The stored value is free text ("normal" | "high" in practice) — fall back rather than crash on a stray value. */
function toPriority(value: string): Priority {
  return (PRIORITIES as readonly string[]).includes(value) ? (value as Priority) : "normal";
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** Every field id this form generates, keyed by the `UpdateMeetingInput` path that blames it. */
function invalidFieldId(fieldId: string, key: string): string | null {
  switch (key) {
    case "title":
      return `${fieldId}-title`;
    case "purpose":
      return `${fieldId}-purpose`;
    case "priority":
      return `${fieldId}-priority`;
    case "delegationSize":
      return `${fieldId}-size`;
    case "leadUserId":
      return `${fieldId}-lead`;
    case "coordinatorUserId":
      return `${fieldId}-coordinator`;
    case "topicIds":
      return `${fieldId}-topic-filter`;
    default:
      return null;
  }
}

/**
 * A user who clicks Save at the bottom of a long form should not have to go hunting for why
 * nothing happened: move keyboard focus (and the viewport) to whichever control the first
 * failed-parse issue blames. `format` has no single id — it is a radio group — so it resolves
 * to the checked option, or the first one if somehow none is.
 */
function focusFirstInvalidField(fieldId: string, error: z.ZodError): void {
  const issue = error.issues[0];
  if (!issue) return;
  const key = String(issue.path[0] ?? "");

  let target: HTMLElement | null = null;
  if (key === "format") {
    target = document.querySelector<HTMLElement>(`input[name="${fieldId}-format"]:checked`) ?? document.querySelector<HTMLElement>(`input[name="${fieldId}-format"]`);
  } else {
    const id = invalidFieldId(fieldId, key);
    if (id) target = document.getElementById(id);
  }
  if (!target) return;

  target.focus();
  // jsdom (and some older embedded webviews) do not implement scrollIntoView at all.
  target.scrollIntoView?.({ block: "center" });
}

export function EditMeetingForm({
  record,
  topicOptions,
  userOptions,
  updateMeeting,
}: {
  record: MeetingRecord;
  topicOptions: EditTopicOption[];
  userOptions: EditUserOption[];
  updateMeeting: RecordAction;
}) {
  const router = useRouter();
  const fieldId = useId();
  const { run, pending, error } = useRecordAction();

  const [title, setTitle] = useState(record.title);
  const [purpose, setPurpose] = useState(record.purpose ?? "");
  const [format, setFormat] = useState<MeetingFormat>(record.format);
  const [ochAttending, setOchAttending] = useState(record.ochAttending);
  const [priority, setPriority] = useState<Priority>(toPriority(record.priority));
  const [delegationSize, setDelegationSize] = useState(record.delegationSize !== null ? String(record.delegationSize) : "");
  const [leadUserId, setLeadUserId] = useState(record.leadUserId ?? "");
  const [coordinatorUserId, setCoordinatorUserId] = useState(record.coordinatorUserId ?? "");
  const [topicIds, setTopicIds] = useState<string[]>(record.topics.map((t) => t.topicId));
  const [topicQuery, setTopicQuery] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const topicById = useMemo(() => new Map(topicOptions.map((t) => [t.id, t])), [topicOptions]);
  const chosenTopics = new Set(topicIds);
  const atTopicLimit = topicIds.length >= 8;
  const topicsFieldId = `${fieldId}-topics`;

  const filteredTopics = useMemo(() => {
    const q = topicQuery.trim().toLowerCase();
    const matches = q === "" ? topicOptions : topicOptions.filter((t) => t.name.toLowerCase().includes(q) || t.group.toLowerCase().includes(q));
    const groups = new Map<string, EditTopicOption[]>();
    for (const topic of matches) {
      const list = groups.get(topic.group);
      if (list) list.push(topic);
      else groups.set(topic.group, [topic]);
    }
    return [...groups];
  }, [topicQuery, topicOptions]);

  function toggleTopic(topicId: string): void {
    if (chosenTopics.has(topicId)) {
      setTopicIds((prev) => prev.filter((id) => id !== topicId));
      return;
    }
    if (atTopicLimit) return;
    setTopicIds((prev) => [...prev, topicId]);
  }

  function moveTopic(index: number, delta: number): void {
    setTopicIds((prev) => {
      const target = index + delta;
      const moved = prev[index];
      const displaced = prev[target];
      if (moved === undefined || displaced === undefined) return prev;
      const next = [...prev];
      next[index] = displaced;
      next[target] = moved;
      return next;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = UpdateMeetingInput.safeParse({
      meetingId: record.id,
      title,
      purpose,
      format,
      ochAttending,
      priority,
      delegationSize,
      leadUserId: leadUserId === "" ? null : leadUserId,
      coordinatorUserId: coordinatorUserId === "" ? null : coordinatorUserId,
      topicIds,
    });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFrom(parsed.error));
      focusFirstInvalidField(fieldId, parsed.error);
      return;
    }
    setFieldErrors({});
    run(() => updateMeeting(parsed.data), {
      success: "Meeting updated.",
      onDone: () => router.push(record.href),
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Panel id="edit-request-heading" eyebrow="Details" title="The request">
        <div className="grid gap-5">
          <TextField id={`${fieldId}-title`} label="Meeting title" value={title} onChange={setTitle} error={fieldErrors.title} autoComplete="off" />
          <TextAreaField
            id={`${fieldId}-purpose`}
            label="Purpose"
            value={purpose}
            onChange={setPurpose}
            error={fieldErrors.purpose}
            hint="A short paragraph in their words — it opens the briefing."
            rows={3}
            autoComplete="off"
          />

          <RadioCards name={`${fieldId}-format`} legend="Format" value={format} onChange={setFormat} options={FORMAT_OPTIONS} error={fieldErrors.format} />

          <div className="grid gap-4 sm:grid-cols-2">
            <SwitchField
              id={`${fieldId}-och`}
              label="OCH attending"
              description="Surfaces this meeting as a VIP engagement across the dashboard."
              checked={ochAttending}
              onChange={setOchAttending}
            />
            <SelectField id={`${fieldId}-priority`} label="Priority" value={priority} onChange={(value) => setPriority(value as Priority)} error={fieldErrors.priority}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </SelectField>
          </div>

          <TextField
            id={`${fieldId}-size`}
            label="Delegation size"
            type="number"
            inputMode="numeric"
            min={1}
            max={200}
            value={delegationSize}
            onChange={setDelegationSize}
            error={fieldErrors.delegationSize}
            hint="Head count including interpreters."
            className="max-w-40"
          />
        </div>
      </Panel>

      <Panel id="edit-ownership-heading" title="Ownership">
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField id={`${fieldId}-lead`} label="OIA lead" value={leadUserId} onChange={setLeadUserId} error={fieldErrors.leadUserId} placeholder="Unassigned" optional>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.title ? `${user.name} — ${user.title}` : user.name}
              </option>
            ))}
          </SelectField>
          <SelectField id={`${fieldId}-coordinator`} label="Coordinator" value={coordinatorUserId} onChange={setCoordinatorUserId} error={fieldErrors.coordinatorUserId} placeholder="Unassigned" optional>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>
                {user.title ? `${user.name} — ${user.title}` : user.name}
              </option>
            ))}
          </SelectField>
        </div>
      </Panel>

      <Panel id="edit-topics-heading" title="Topics" action={<span className="numeric text-xs text-muted-foreground">{topicIds.length} of 8</span>}>
        <div className="grid gap-3">
          {topicIds.length > 0 ? (
            <ol aria-label="Chosen topics, most important first" className="grid gap-2">
              {topicIds.map((topicId, index) => {
                const name = topicById.get(topicId)?.name ?? topicId;
                return (
                  <li key={topicId} className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-soft">
                    <span aria-hidden className="numeric inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => moveTopic(index, -1)} className={iconButton}>
                        <ArrowUp className="size-3.5" aria-hidden />
                      </button>
                      <button type="button" aria-label={`Move ${name} down`} disabled={index === topicIds.length - 1} onClick={() => moveTopic(index, 1)} className={iconButton}>
                        <ArrowDown className="size-3.5" aria-hidden />
                      </button>
                      <button type="button" aria-label={`Remove ${name}`} onClick={() => toggleTopic(topicId)} className={iconButton}>
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          <fieldset className="rounded-xl border bg-card/60 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Available topics</legend>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id={`${fieldId}-topic-filter`}
                value={topicQuery}
                aria-label="Filter topics"
                placeholder="Filter topics…"
                autoComplete="off"
                aria-describedby={describedBy(topicsFieldId, undefined, fieldErrors.topicIds)}
                onChange={(e) => setTopicQuery(e.target.value)}
                className="h-8 pl-8"
              />
            </div>
            {atTopicLimit ? <p className="mt-2 text-xs text-muted-foreground">Eight is the most a briefing can rank — remove one to add another.</p> : null}
            <FieldMessages id={topicsFieldId} error={fieldErrors.topicIds} />
            <div className="mt-3 grid max-h-64 gap-3 overflow-y-auto pr-1">
              {filteredTopics.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">No topic matches that filter.</p> : null}
              {filteredTopics.map(([group, items]) => (
                <div key={group}>
                  <p className="eyebrow mb-1.5">{group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((topic) => {
                      const selected = chosenTopics.has(topic.id);
                      const disabled = !selected && atTopicLimit;
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={disabled}
                          onClick={() => toggleTopic(topic.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
                            selected ? "border-primary/50 bg-primary/10 text-primary" : "bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                          )}
                        >
                          {selected ? <Check className="size-3" aria-hidden /> : <Plus className="size-3" aria-hidden />}
                          {topic.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </Panel>

      <ActionError message={error} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href={record.href} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={buttonVariants({ variant: "default", size: "lg" })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save changes
        </button>
      </div>
    </form>
  );
}
