"use client";

import { CalendarCheck, CalendarClock, CalendarPlus, CalendarX2, Check, Loader2, X } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useId, useState } from "react";
import { Flag } from "@/components/common/Flag";
import { RadioCards, TextAreaField, TextField } from "@/components/meetings/wizard/fields";
import { parseWallClock } from "@/components/meetings/wizard/wizard-schema";
import { buttonVariants } from "@/components/ui/button";
import type { CandidateDateRow } from "@/lib/db/types";
import type { CandidateDateStatus, Proposer } from "@/lib/domain/types";
import { formatDateNY, formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionError, useRecordAction, type CreateRecordAction, type RecordAction } from "./tab-actions";

/**
 * The date negotiation, in the order it happened.
 *
 * Agreeing a date is the single slowest step in the program, so this panel shows the whole
 * back-and-forth rather than only the winner: who offered what, what came back, and what is
 * still on the table. Accepting one option stands the others down and sets the meeting's
 * confirmed slot — the service does that, so nothing here has to be typed twice.
 */

type Tone = { icon: typeof CalendarCheck; label: string; box: string; mark: string; spent: boolean };

const TONE: Record<CandidateDateStatus, Tone> = {
  accepted: { icon: CalendarCheck, label: "Accepted", box: "border-ok/40 bg-ok/8", mark: "text-ok", spent: false },
  proposed: { icon: CalendarClock, label: "Proposed", box: "border-border bg-muted/30", mark: "text-muted-foreground", spent: false },
  declined: { icon: CalendarX2, label: "Declined", box: "border-border", mark: "text-muted-foreground", spent: true },
  withdrawn: { icon: CalendarX2, label: "Withdrawn", box: "border-border", mark: "text-muted-foreground", spent: true },
};

/** Who put this option on the table — the delegation's flag, or the Commission's seal. */
function ProposerMark({ proposedBy, countryCode }: { proposedBy: Proposer; countryCode: string }) {
  if (proposedBy === "fcc") return <Image src="/brand/fcc-seal.svg" alt="" width={16} height={16} className="size-4 shrink-0" />;
  return <Flag code={countryCode} size={11} />;
}

export function CandidateDatePanel({
  meetingId,
  countryCode,
  dates,
  canUpdate,
  acceptDate,
  declineDate,
  proposeDate,
}: {
  meetingId: string;
  /** The delegation's flag, shown against the options they proposed. */
  countryCode: string;
  dates: CandidateDateRow[];
  canUpdate: boolean;
  acceptDate: RecordAction;
  declineDate: RecordAction;
  proposeDate: CreateRecordAction;
}) {
  const { run, pending, error } = useRecordAction();
  const ordered = [...dates].sort((a, b) => a.start.getTime() - b.start.getTime());

  return (
    <div className="flex flex-col gap-4">
      {ordered.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No dates on the table yet. Propose one below, or record the window the delegation asked for — a confirmed date is the first of the six readiness checks.
        </p>
      ) : (
        <ol className="space-y-2">
          {ordered.map((date) => {
            const tone = TONE[date.status];
            const Icon = tone.icon;
            const when = formatRange(date.start, date.end);
            return (
              <li key={date.id} aria-label={`${tone.label} — ${when}`} className={cn("flex items-start gap-3 rounded-2xl border px-3 py-2.5", tone.box)}>
                <Icon className={cn("mt-0.5 size-4 shrink-0", tone.mark)} aria-hidden />

                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", tone.spent ? "text-muted-foreground line-through" : "text-foreground")}>{when}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("font-medium", date.status === "accepted" ? "text-ok" : "")}>{tone.label}</span>
                    <span aria-hidden>·</span>
                    <ProposerMark proposedBy={date.proposedBy} countryCode={countryCode} />
                    <span>proposed by {date.proposedBy === "fcc" ? "the FCC" : "the delegation"}</span>
                    <span aria-hidden>·</span>
                    <span className="numeric">{formatDateNY(date.createdAt, "short")}</span>
                  </p>
                  {date.note ? <p className="mt-1 text-xs text-foreground/80">{date.note}</p> : null}
                </div>

                {canUpdate && (date.status === "proposed" || date.status === "declined") ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={pending}
                      aria-label={`Accept ${when}`}
                      onClick={() => run(() => acceptDate({ meetingId, id: date.id }), { success: `${formatDateNY(date.start, "weekday")} is the confirmed date.` })}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      <Check aria-hidden />
                      Accept
                    </button>
                    {date.status === "proposed" ? (
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Decline ${when}`}
                        onClick={() => run(() => declineDate({ meetingId, id: date.id }), { success: "Date declined." })}
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                      >
                        <X aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <ActionError message={error} />

      {canUpdate ? <ProposeForm meetingId={meetingId} proposeDate={proposeDate} /> : null}
    </div>
  );
}

/** Times are entered and read as Washington wall clocks — the program runs on one clock. */
function ProposeForm({ meetingId, proposeDate }: { meetingId: string; proposeDate: CreateRecordAction }) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [proposedBy, setProposedBy] = useState<Proposer>("fcc");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);

  const startAt = start.trim() === "" ? null : parseWallClock(start);
  const endAt = end.trim() === "" ? null : parseWallClock(end);
  const startError = attempted ? (start.trim() === "" ? "Pick the day and time to offer." : startAt ? undefined : "That date could not be read.") : undefined;
  const endError = attempted
    ? end.trim() !== "" && !endAt
      ? "That date could not be read."
      : startAt && endAt && endAt.getTime() <= startAt.getTime()
        ? "The end must come after the start."
        : undefined
    : undefined;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAttempted(true);
    if (!startAt || startError || (end.trim() !== "" && !endAt) || (endAt && endAt.getTime() <= startAt.getTime())) return;
    run(
      () =>
        proposeDate({
          meetingId,
          start: startAt.toISOString(),
          end: endAt ? endAt.toISOString() : undefined,
          proposedBy,
          note: note.trim() === "" ? undefined : note.trim(),
        }),
      {
        success: `${formatDateNY(startAt, "weekday")} added to the options.`,
        onDone: () => {
          setStart("");
          setEnd("");
          setNote("");
          setAttempted(false);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 rounded-2xl border bg-muted/25 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CalendarPlus className="size-4 text-muted-foreground" aria-hidden />
        Put another date on the table
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField id={`${ids}-start`} label="Start" type="datetime-local" value={start} onChange={setStart} error={startError} hint="Washington time" />
        <TextField id={`${ids}-end`} label="End" optional type="datetime-local" value={end} onChange={setEnd} error={endError} hint="Leave empty for a 90-minute slot" />
      </div>

      <RadioCards
        name={`${ids}-by`}
        legend="Proposed by"
        columns={2}
        value={proposedBy}
        onChange={setProposedBy}
        options={[
          { value: "fcc", label: "The FCC", description: "We are offering this slot." },
          { value: "visitor", label: "The delegation", description: "They asked for this slot." },
        ]}
      />

      <TextAreaField id={`${ids}-note`} label="Note" optional rows={2} value={note} onChange={setNote} placeholder="Only the afternoon works for the delegation." />

      <ActionError message={error} />

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Propose date
        </button>
      </div>
    </form>
  );
}
