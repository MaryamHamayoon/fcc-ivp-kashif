"use client";

import { Check, Loader2, Mail, UserMinus, X } from "lucide-react";
import { UserAvatar } from "@/components/common/Avatar";
import { buttonVariants } from "@/components/ui/button";
import { businessDaysBetween } from "@/lib/domain/business-days";
import { EXPERT_STATUS_LABELS, type ExpertStatus } from "@/lib/domain/types";
import { formatDateNY } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";

/** One briefing assignment, as the record stores it (the staff row travels with it). */
export type ExpertAssignment = MeetingRecord["experts"][number];

const TONE: Record<ExpertStatus, string> = {
  confirmed: "border-ok/35 bg-ok/10 text-ok",
  requested: "border-warn/35 bg-warn/10 text-warn",
  tbd: "border-border bg-muted text-muted-foreground",
  declined: "border-destructive/30 bg-destructive/8 text-destructive",
  withdrawn: "border-border bg-muted text-muted-foreground",
};

const ROLE_LABEL: Record<ExpertAssignment["role"], string | null> = { lead: "Lead briefer", briefer: null, attendee: "Attending" };

/**
 * One expert on the meeting: who they are, where the ask stands, and the single next move.
 *
 * The line under the name is the whole negotiation in one sentence — asked on this day,
 * answered on that one, or still owing us an answer after N business days. Weekends do not
 * count against a briefer, so the age is business days, the same clock the rail uses.
 */
export function ExpertRow({
  expert,
  now,
  canUpdate,
  canRespond,
  pending,
  onRequest,
  onRespond,
  onRemove,
}: {
  expert: ExpertAssignment;
  now: Date;
  canUpdate: boolean;
  canRespond: boolean;
  pending: boolean;
  onRequest: (expert: ExpertAssignment) => void;
  onRespond: (expert: ExpertAssignment, status: "confirmed" | "declined") => void;
  onRemove: (expert: ExpertAssignment) => void;
}) {
  const { staff, status } = expert;
  const waitingDays = status === "requested" && expert.requestedAt ? businessDaysBetween(expert.requestedAt, now) : null;
  const roleLabel = ROLE_LABEL[expert.role];
  const spent = status === "declined" || status === "withdrawn";

  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      {/* A spent assignment fades in colour, not in contrast: `saturate` preserves luminance, so the initials stay legible. */}
      <UserAvatar name={staff.name} size="sm" decorative className={cn("mt-0.5", spent && "saturate-50")} />

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-sm font-medium text-foreground", spent && "text-muted-foreground line-through")}>{staff.name}</span>
          <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[0.6875rem] font-medium", TONE[status])}>{EXPERT_STATUS_LABELS[status]}</span>
          {roleLabel ? <span className="text-[0.6875rem] font-medium tracking-wide text-muted-foreground uppercase">{roleLabel}</span> : null}
        </p>

        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {staff.title ?? "FCC staff"}
          {staff.email ? (
            <>
              {" · "}
              {/* Underlined always: this link sits inside a sentence, where colour alone would not distinguish it. */}
              <a href={`mailto:${staff.email}`} className="rounded text-primary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {staff.email}
              </a>
            </>
          ) : null}
        </p>

        <p className="numeric mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {expert.requestedAt ? <span>Asked {formatDateNY(expert.requestedAt, "short")}</span> : <span>Not asked yet</span>}
          {expert.respondedAt ? <span>· Answered {formatDateNY(expert.respondedAt, "short")}</span> : null}
          {waitingDays !== null ? (
            <span className={cn("font-semibold", waitingDays >= 5 ? "text-age-alert" : waitingDays >= 3 ? "text-age-warn" : "text-muted-foreground")}>
              {waitingDays} business {waitingDays === 1 ? "day" : "days"} awaiting reply
            </span>
          ) : null}
        </p>
        {expert.note ? <p className="mt-1 text-xs text-foreground/80">“{expert.note}”</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {canUpdate && (status === "tbd" || status === "declined") ? (
          <button type="button" disabled={pending} aria-label={`Request ${staff.name}`} onClick={() => onRequest(expert)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Mail aria-hidden />}
            Request
          </button>
        ) : null}

        {canRespond && status === "requested" ? (
          <>
            <button type="button" disabled={pending} aria-label={`Confirm ${staff.name}`} onClick={() => onRespond(expert, "confirmed")} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Check aria-hidden />
              Confirm
            </button>
            <button type="button" disabled={pending} aria-label={`Decline for ${staff.name}`} onClick={() => onRespond(expert, "declined")} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
              <X aria-hidden />
            </button>
          </>
        ) : null}

        {canUpdate && status !== "withdrawn" ? (
          <button type="button" disabled={pending} aria-label={`Remove ${staff.name} from this meeting`} onClick={() => onRemove(expert)} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
            <UserMinus aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}
