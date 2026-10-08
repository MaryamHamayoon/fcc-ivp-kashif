"use client";

import { ChevronDown, Loader2, PauseCircle, PenLine, PlayCircle, SquarePen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TransitionDialog, type TransitionAction } from "@/components/meetings/TransitionDialog";
import { buttonVariants } from "@/components/ui/button";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import type { TransitionOutcome } from "@/lib/services/meetings";
import type { RecordPermissions } from "@/lib/services/record";
import { cn } from "@/lib/utils";

/** `resumeAction` from `app/(app)/meetings/actions.ts`; injected so the header stays testable. */
export type ResumeAction = (meetingId: string) => Promise<TransitionOutcome>;

export type RecordActionsProps = {
  meetingId: string;
  code: string;
  status: MeetingStatus;
  /** Where the status may go from here — empty for a held or finished meeting. */
  allowed: MeetingStatus[];
  hasAcceptedDate: boolean;
  /** Where a held meeting lands when it comes back. */
  resumesTo: MeetingStatus;
  permissions: RecordPermissions;
  transition: TransitionAction;
  resume: ResumeAction;
  className?: string;
};

/**
 * The four things a coordinator does from the top of a record: move the status, park it,
 * write down what just happened, or correct the details. Every one is gated on the policy —
 * an executive sees the record, not the controls.
 *
 * Coming off hold is one click with a toast rather than a dialog: it is reversible, and the
 * meeting already carries the reason it was paused.
 */
export function RecordActions({ meetingId, code, status, allowed, hasAcceptedDate, resumesTo, permissions, transition, resume, className }: RecordActionsProps) {
  const router = useRouter();
  const [target, setTarget] = useState<MeetingStatus | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [resuming, startResume] = useTransition();

  const canMove = permissions.transition && allowed.length > 0;
  const canHold = permissions.transition && allowed.includes("on_hold");
  const canResume = permissions.transition && status === "on_hold";

  function openDialog(to?: MeetingStatus): void {
    setTarget(to);
    setOpen(true);
  }

  function onResume(): void {
    startResume(async () => {
      const outcome = await resume(meetingId);
      if (!outcome.ok) {
        toast.error(outcome.reason);
        return;
      }
      toast.success(`${code} · ${STATUS_LABELS[outcome.status ?? resumesTo]}`);
      router.refresh();
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {canMove ? (
        <button type="button" onClick={() => openDialog(undefined)} className={buttonVariants({ variant: "default", size: "lg" })}>
          Change status
          <ChevronDown className="opacity-70" aria-hidden />
        </button>
      ) : null}

      {canHold ? (
        <button type="button" onClick={() => openDialog("on_hold")} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <PauseCircle aria-hidden />
          Put on hold
        </button>
      ) : null}

      {canResume ? (
        <button type="button" onClick={onResume} disabled={resuming} className={buttonVariants({ variant: "default", size: "lg" })}>
          {resuming ? <Loader2 className="animate-spin" aria-hidden /> : <PlayCircle aria-hidden />}
          Resume
        </button>
      ) : null}

      {permissions.logActivity ? (
        <Link href={`/meetings/${meetingId}/activity#composer`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          <SquarePen aria-hidden />
          Log activity
        </Link>
      ) : null}

      {permissions.update ? (
        <Link href={`/meetings/${meetingId}/edit`} className={buttonVariants({ variant: "ghost", size: "lg" })}>
          <PenLine aria-hidden />
          Edit
        </Link>
      ) : null}

      {permissions.transition ? (
        <TransitionDialog meetingId={meetingId} code={code} status={status} hasAcceptedDate={hasAcceptedDate} open={open} onOpenChange={setOpen} target={target} action={transition} />
      ) : null}
    </div>
  );
}
