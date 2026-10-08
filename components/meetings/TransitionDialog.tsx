"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { SelectField, TextAreaField, TextField } from "@/components/meetings/wizard/fields";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { nyDate } from "@/lib/domain/fiscal-year";
import { allowedTransitions, canTransition } from "@/lib/domain/status-machine";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import type { TransitionOutcome } from "@/lib/services/meetings";

/** The shape of `transitionAction` in `app/(app)/meetings/actions.ts`; injected so the dialog stays testable. */
export type TransitionAction = (input: unknown) => Promise<TransitionOutcome>;

export type TransitionDialogProps = {
  meetingId: string;
  /** IVP code — named in the title and the success toast. */
  code: string;
  status: MeetingStatus;
  /** Whether a candidate date has been accepted: the guard for Confirmed and Completed. */
  hasAcceptedDate: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the destination — a board drop, "Put on hold", "Cancel" — and names the dialog after it. */
  target?: MeetingStatus;
  action: TransitionAction;
  /** Runs after a successful move, with the new status. */
  onDone?: (status: MeetingStatus) => void;
};

const TITLES: Partial<Record<MeetingStatus, string>> = {
  on_hold: "Put on hold",
  cancelled: "Cancel this meeting",
  completed: "Mark as completed",
  closed: "Close out",
};

const titleFor = (to: MeetingStatus | ""): string => (to === "" ? "Change status" : (TITLES[to] ?? `Move to ${STATUS_LABELS[to]}`));

/** 09:00 in Washington on the chosen day — a follow-up is a morning task, not a midnight one. */
function followUpInstant(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const date = nyDate(Number(m[1]), Number(m[2]), Number(m[3]), 9, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * One dialog for every status change — including onto hold and to cancelled — used by
 * the board, the record header and the move menus. It mirrors the domain guards
 * (`canTransition`) so a blocked move is explained before anything is sent, and the
 * server's own verdict is shown in place when it disagrees.
 */
export function TransitionDialog(props: TransitionDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <TransitionForm key={props.target ?? "any"} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function TransitionForm({ meetingId, code, status, hasAcceptedDate, target, action, onDone, onOpenChange }: TransitionDialogProps) {
  const router = useRouter();
  const ids = useId();
  const targets = allowedTransitions(status);
  const preset = target && targets.includes(target) ? target : targets.length === 1 ? targets[0] : undefined;

  const [to, setTo] = useState<MeetingStatus | "">(preset ?? "");
  const [holdReason, setHoldReason] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [note, setNote] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const followUpAt = followUp === "" ? null : followUpInstant(followUp);
  const guard = to === "" ? null : canTransition(status, to, { hasAcceptedDate, holdReason, holdFollowUpAt: followUpAt, cancelReason });
  // A missing date cannot be fixed here, so say so at once; missing text waits for a submit.
  const blocked = guard && !guard.ok && (to === "confirmed" || to === "completed") ? guard.reason : null;

  const needsHoldReason = to === "on_hold" && holdReason.trim() === "";
  const needsFollowUp = to === "on_hold" && followUpAt === null;
  const needsCancelReason = to === "cancelled" && cancelReason.trim() === "";
  const errors = {
    to: attempted && to === "" ? "Choose where this meeting goes next." : (blocked ?? undefined),
    holdReason: attempted && needsHoldReason ? "Say why it is on hold — the record has to explain itself later." : undefined,
    followUp: attempted && needsFollowUp ? "Pick the day to check back." : undefined,
    cancelReason: attempted && needsCancelReason ? "Say why it was cancelled." : undefined,
  };

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAttempted(true);
    if (to === "" || blocked || needsHoldReason || needsFollowUp || needsCancelReason) return;
    const destination = to;
    setServerError(null);
    startTransition(async () => {
      const outcome = await action({
        meetingId,
        to: destination,
        holdReason: destination === "on_hold" ? holdReason.trim() : undefined,
        holdFollowUpAt: destination === "on_hold" ? followUpAt?.toISOString() : undefined,
        cancelReason: destination === "cancelled" ? cancelReason.trim() : undefined,
        note: note.trim() === "" ? undefined : note.trim(),
      });
      if (!outcome.ok) {
        setServerError(outcome.reason);
        return;
      }
      const landed = outcome.status ?? destination;
      toast.success(`${code} · ${STATUS_LABELS[landed]}`);
      onDone?.(landed);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{titleFor(to)}</DialogTitle>
        <DialogDescription>
          <span className="numeric">{code}</span> is {STATUS_LABELS[status].toLowerCase()}
          {to !== "" ? (
            <>
              {" "}
              — moving to <strong className="font-medium text-foreground">{STATUS_LABELS[to]}</strong>
            </>
          ) : null}
          .
        </DialogDescription>
      </DialogHeader>

      {targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">{status === "on_hold" ? "A held meeting is resumed, not moved — use Resume." : "This meeting has reached the end of its lifecycle."}</p>
      ) : (
        <SelectField id={`${ids}-to`} label="New status" value={to} onChange={(value) => setTo(value as MeetingStatus | "")} error={errors.to} placeholder="Choose…">
          {targets.map((candidate) => (
            <option key={candidate} value={candidate}>
              {STATUS_LABELS[candidate]}
            </option>
          ))}
        </SelectField>
      )}

      {to === "on_hold" ? (
        <>
          <TextAreaField id={`${ids}-hold`} label="Why is it on hold?" value={holdReason} onChange={setHoldReason} error={errors.holdReason} rows={2} placeholder="Waiting for the embassy to confirm the delegation can travel." />
          <TextField id={`${ids}-follow`} label="Follow up on" type="date" value={followUp} onChange={setFollowUp} error={errors.followUp} hint="The day this needs a look — it surfaces on the dashboard." className="sm:w-1/2" />
        </>
      ) : null}
      {to === "cancelled" ? <TextAreaField id={`${ids}-cancel`} label="Why was it cancelled?" value={cancelReason} onChange={setCancelReason} error={errors.cancelReason} rows={2} placeholder="The delegation postponed its travel indefinitely." /> : null}
      {targets.length > 0 ? <TextAreaField id={`${ids}-note`} label="Note" optional value={note} onChange={setNote} rows={2} placeholder="Anything the next person should know." /> : null}

      {serverError ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{serverError}</span>
        </p>
      ) : null}

      <DialogFooter>
        <button type="button" onClick={() => onOpenChange(false)} className={buttonVariants({ variant: "ghost" })}>
          Keep as is
        </button>
        <button type="submit" disabled={pending || blocked !== null || targets.length === 0} className={buttonVariants({ variant: to === "cancelled" ? "destructive" : "default" })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : titleFor(to)}
        </button>
      </DialogFooter>
    </form>
  );
}
