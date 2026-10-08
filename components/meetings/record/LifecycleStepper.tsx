"use client";

import { Ban, Check, PauseCircle } from "lucide-react";
import { motion } from "motion/react";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PIPELINE_ORDER, resumeTarget } from "@/lib/domain/status-machine";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

/**
 * Where the meeting sits in its lifecycle, and what the stage asks of whoever is holding it.
 *
 * The client's deck used three vocabularies; we keep one status machine and carry the eight
 * workflow steps (Create · Plan · Clear · Confirm · Prepare · Conduct · Complete · Close) as
 * guidance on the stage they belong to, so nobody has to remember what "Clearance" means.
 *
 * A held meeting still shows the stage it will come back to — pausing is not going backwards —
 * and a cancelled one shows where it stopped, with no current stage at all.
 */

export type LifecycleStepperProps = {
  status: MeetingStatus;
  previousStatus?: MeetingStatus | null;
  holdReason?: string | null;
  holdFollowUpAt?: Date | null;
  cancelReason?: string | null;
  className?: string;
};

type StepState = "done" | "current" | "paused" | "stopped" | "future";

const STATE_WORD: Record<StepState, string> = {
  done: "Done",
  current: "Current stage",
  paused: "Paused here",
  stopped: "Stopped here",
  future: "Not started",
};

type Hint = { steps: string; hint: string };

/** The deck's eight workflow steps, mapped onto the six lifecycle stages. */
const HINTS: Record<MeetingStatus, Hint> = {
  requested: { steps: "Create", hint: "Intake is logged and the request has an owner — a coordinator and a regional lead." },
  developing: { steps: "Plan", hint: "Source the topics and briefers, and negotiate candidate dates with the delegation." },
  clearance: { steps: "Clear", hint: "Route for OIA front-office sign-off and Office of the Chairman awareness." },
  confirmed: { steps: "Confirm · Prepare", hint: "Date and briefers are locked. Build the agenda, briefing materials and logistics." },
  completed: { steps: "Conduct · Complete", hint: "The meeting was held. Record actual attendance and file the readout." },
  closed: { steps: "Close", hint: "The record is final and counts toward fiscal-year reporting." },
  on_hold: { steps: "Hold", hint: "Paused with a reason and a date to look again." },
  cancelled: { steps: "Cancel", hint: "Stopped with a reason; the record stays for the history." },
};

const DOT: Record<StepState, string> = {
  done: "border-primary/35 bg-primary/12 text-primary",
  current: "border-brand bg-accent text-accent-foreground",
  paused: "border-status-on-hold/60 bg-status-on-hold/12 text-foreground",
  stopped: "border-status-cancelled/60 bg-status-cancelled/12 text-foreground",
  future: "border-border bg-card text-muted-foreground",
};

const LABEL: Record<StepState, string> = {
  done: "text-foreground",
  current: "text-foreground",
  paused: "text-foreground",
  stopped: "text-foreground",
  future: "text-muted-foreground",
};

/** The stage the stepper points at: for a held or cancelled meeting, the one it left. */
function anchorOf(status: MeetingStatus, previousStatus: MeetingStatus | null): MeetingStatus {
  if (status === "on_hold") return resumeTarget(previousStatus);
  if (status === "cancelled") return previousStatus && previousStatus !== "cancelled" ? previousStatus : "requested";
  return status;
}

function stateAt(index: number, anchorIndex: number, status: MeetingStatus): StepState {
  if (index < anchorIndex) return "done";
  if (index > anchorIndex) return "future";
  if (status === "on_hold") return "paused";
  if (status === "cancelled") return "stopped";
  return "current";
}

export function LifecycleStepper({ status, previousStatus = null, holdReason, holdFollowUpAt, cancelReason, className }: LifecycleStepperProps) {
  const reduce = useReducedMotion();
  const anchor = anchorOf(status, previousStatus);
  const anchorIndex = PIPELINE_ORDER.indexOf(anchor);

  return (
    <Panel id="lifecycle-heading" eyebrow="Lifecycle" title="Where this stands" className={className}>
      {status === "on_hold" ? (
        <Callout tone="hold" label={`On hold — resumes to ${STATUS_LABELS[anchor]}`} icon={<PauseCircle className="size-4" aria-hidden />} title="On hold" first>
          {holdReason ? <p className="mt-1 text-sm leading-relaxed text-foreground">{holdReason}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {holdFollowUpAt ? (
              <span>
                Follow up{" "}
                <time dateTime={holdFollowUpAt.toISOString()} className="numeric text-foreground">
                  {formatDateNY(holdFollowUpAt, "short")}
                </time>
              </span>
            ) : null}
            <span>
              Resumes to <strong className="font-medium text-foreground">{STATUS_LABELS[anchor]}</strong>
            </span>
          </p>
        </Callout>
      ) : null}

      {status === "cancelled" ? (
        <Callout tone="cancel" label="Cancelled" icon={<Ban className="size-4" aria-hidden />} title="Cancelled" first>
          {cancelReason ? <p className="mt-1 text-sm leading-relaxed text-foreground">{cancelReason}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">The record stays on file — cancelled meetings still count in the country and organization history.</p>
        </Callout>
      ) : null}

      <ol aria-label="Meeting lifecycle" className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        {PIPELINE_ORDER.map((stage, index) => {
          const state = stateAt(index, anchorIndex, status);
          const hint = HINTS[stage];
          return (
            <motion.li
              key={stage}
              aria-current={state === "current" || state === "paused" ? "step" : undefined}
              className="relative min-w-0"
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionTransition({ duration: 0.3, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] })}
            >
              <Tooltip>
                <TooltipTrigger className="flex w-full min-w-0 cursor-help flex-col items-start gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span aria-hidden className="flex w-full items-center gap-2">
                    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-[0.6875rem] font-semibold transition-colors", DOT[state])}>
                      {state === "done" ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    <span className={cn("h-px min-w-0 flex-1 rounded-full", index < anchorIndex ? "bg-primary/30" : "bg-border")} />
                  </span>
                  {/* Full width, or a no-wrap caption would size this to its own text and spill into the next column. */}
                  <span className="block w-full min-w-0">
                    <span className={cn("block truncate text-sm font-medium", LABEL[state])}>{STATUS_LABELS[stage]}</span>
                    <span className="eyebrow mt-0.5 block text-[0.625rem] leading-snug">{hint.steps}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="block">
                    <strong className="font-semibold">{hint.steps}</strong> — {hint.hint}
                  </span>
                </TooltipContent>
              </Tooltip>
              <span className="sr-only">{STATE_WORD[state]}</span>
            </motion.li>
          );
        })}
      </ol>
    </Panel>
  );
}

function Callout({ tone, label, icon, title, first, children }: { tone: "hold" | "cancel"; label: string; icon: ReactNode; title: string; first?: boolean; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("rounded-2xl border px-4 py-3", first ? "mb-5" : "mt-4", tone === "hold" ? "border-status-on-hold/35 bg-status-on-hold/8" : "border-status-cancelled/35 bg-status-cancelled/8")}
    >
      <p className={cn("flex items-center gap-2 text-sm font-semibold", tone === "hold" ? "text-status-on-hold" : "text-status-cancelled")}>
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}
