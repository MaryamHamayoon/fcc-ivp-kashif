"use client";

import { Languages, Loader2, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTICIPANT_CATEGORIES, PARTICIPANT_CATEGORY_LABELS, type ParticipantCategory } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { ActionError, useRecordAction, type RecordAction } from "./tab-actions";

export type ParticipantEntry = MeetingRecord["participants"][number];
export type ParticipantTotalRow = MeetingRecord["participantTotals"][number];

/**
 * The roster, grouped the way the annual report counts it. Named people and headcounts are
 * captured separately on purpose: a delegation of twelve routinely sends four names, and a
 * report that quietly inferred one from the other would be wrong every time.
 */
export function ParticipantsTable({
  meetingId,
  participants,
  canUpdate,
  removeParticipant,
}: {
  meetingId: string;
  participants: ParticipantEntry[];
  canUpdate: boolean;
  removeParticipant: RecordAction;
}) {
  const { run, pending, error } = useRecordAction();

  if (participants.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Nobody is named yet. Adding the delegation roster satisfies the participant-list readiness check and gives a briefer something to read on the way in.
      </p>
    );
  }

  const groups = PARTICIPANT_CATEGORIES.map((category) => ({ category, rows: participants.filter((p) => p.category === category) })).filter((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <ActionError message={error} />

      {groups.map((group) => (
        <div key={group.category} className="min-w-0">
          <h3 className="mb-1 flex items-baseline justify-between gap-3 text-sm font-semibold">
            {PARTICIPANT_CATEGORY_LABELS[group.category]}
            <span className="numeric text-xs font-medium text-muted-foreground">{group.rows.length} named</span>
          </h3>
          <Table>
            {/* One table per category: each needs its own name, because a screen reader's table
                list shows them side by side with no heading between. */}
            <caption className="sr-only">{PARTICIPANT_CATEGORY_LABELS[group.category]} — named participants</caption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[42%]">Name</TableHead>
                <TableHead>Title</TableHead>
                {canUpdate ? (
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium whitespace-normal">
                    <span className="flex items-center gap-1.5">
                      {person.name}
                      {person.isInterpreter ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-1.5 text-[0.625rem] font-medium text-muted-foreground">
                          <Languages className="size-3" aria-hidden />
                          Interpreter
                        </span>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{person.title ?? "—"}</TableCell>
                  {canUpdate ? (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Remove ${person.name} from the roster`}
                        onClick={() => run(() => removeParticipant({ meetingId, id: person.id }), { success: `${person.name} removed from the roster.` })}
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      >
                        <Trash2 aria-hidden />
                      </button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

type Draft = Record<ParticipantCategory, { planned: string; actual: string }>;

const toDraft = (totals: ParticipantTotalRow[]): Draft =>
  Object.fromEntries(
    PARTICIPANT_CATEGORIES.map((category) => {
      const row = totals.find((t) => t.category === category);
      return [category, { planned: String(row?.planned ?? 0), actual: row?.actual === null || row?.actual === undefined ? "" : String(row.actual) }];
    }),
  ) as Draft;

const numeric = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Headcounts per category — the four tiles on the Overview and the numbers the annual report
 * asks for, entered once here. `Actual` only appears once the meeting has happened; before
 * that there is nothing honest to put in it.
 */
export function ParticipantTotalsEditor({
  meetingId,
  totals,
  showActual,
  canUpdate,
  setParticipantTotals,
}: {
  meetingId: string;
  totals: ParticipantTotalRow[];
  /** The meeting is completed or closed: ask for who actually turned up. */
  showActual: boolean;
  canUpdate: boolean;
  setParticipantTotals: RecordAction;
}) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [draft, setDraft] = useState<Draft>(() => toDraft(totals));

  const plannedTotal = PARTICIPANT_CATEGORIES.reduce((sum, category) => sum + numeric(draft[category].planned), 0);
  const actualTotal = PARTICIPANT_CATEGORIES.reduce((sum, category) => sum + numeric(draft[category].actual), 0);

  function save(): void {
    run(
      () =>
        setParticipantTotals({
          meetingId,
          totals: PARTICIPANT_CATEGORIES.map((category) => ({
            category,
            planned: numeric(draft[category].planned),
            actual: showActual && draft[category].actual.trim() !== "" ? numeric(draft[category].actual) : null,
          })),
        }),
      { success: "Headcounts saved." },
    );
  }

  if (!canUpdate) {
    return (
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PARTICIPANT_CATEGORIES.map((category) => {
          const row = totals.find((t) => t.category === category);
          return (
            <div key={category} className="rounded-xl border bg-muted/30 px-3 py-2">
              <dt className="text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{PARTICIPANT_CATEGORY_LABELS[category]}</dt>
              <dd className="numeric mt-0.5 text-lg leading-none font-medium">{formatNumber(showActual ? (row?.actual ?? row?.planned ?? 0) : (row?.planned ?? 0))}</dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("grid gap-x-4 gap-y-3", showActual ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
        {PARTICIPANT_CATEGORIES.map((category) => (
          <div key={category} className="min-w-0">
            <span className="mb-1 block text-xs font-medium text-foreground">{PARTICIPANT_CATEGORY_LABELS[category]}</span>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor={`${ids}-${category}-planned`} className="mb-0.5 block text-[0.625rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Planned
                </label>
                <Input
                  id={`${ids}-${category}-planned`}
                  type="number"
                  min={0}
                  max={999}
                  inputMode="numeric"
                  value={draft[category].planned}
                  aria-label={`${PARTICIPANT_CATEGORY_LABELS[category]} planned`}
                  onChange={(event) => setDraft({ ...draft, [category]: { ...draft[category], planned: event.target.value } })}
                  className="numeric h-9"
                />
              </div>
              {showActual ? (
                <div className="min-w-0 flex-1">
                  <label htmlFor={`${ids}-${category}-actual`} className="mb-0.5 block text-[0.625rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    Actual
                  </label>
                  <Input
                    id={`${ids}-${category}-actual`}
                    type="number"
                    min={0}
                    max={999}
                    inputMode="numeric"
                    placeholder="—"
                    value={draft[category].actual}
                    aria-label={`${PARTICIPANT_CATEGORY_LABELS[category]} actual`}
                    onChange={(event) => setDraft({ ...draft, [category]: { ...draft[category], actual: event.target.value } })}
                    className="numeric h-9"
                  />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <ActionError message={error} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p className="numeric text-sm text-muted-foreground">
          {formatNumber(plannedTotal)} planned
          {showActual ? ` · ${formatNumber(actualTotal)} attended` : ""}
        </p>
        <button type="button" disabled={pending} onClick={save} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save headcounts
        </button>
      </div>
    </div>
  );
}
