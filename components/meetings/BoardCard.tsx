"use client";

import { Star } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { DragEvent } from "react";
import { Flag } from "@/components/common/Flag";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { motionTransition } from "@/lib/motion";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatRange, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CandidateDates } from "./CandidateDates";
import { ExpertAvatars } from "./ExpertAvatars";
import { MoveMenu } from "./MoveMenu";
import { ReadinessRing } from "./ReadinessRing";
import { WaitingOnChip } from "./WaitingOnChip";

export type BoardCardProps = {
  meeting: MeetingListItem;
  now: Date;
  /** Position in the column's reveal stagger; ignored when the reader asked for less motion. */
  index: number;
  reduce: boolean;
  dragging: boolean;
  /** True while its move is in flight — the card is already in its new column. */
  pending: boolean;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onMove: (to: MeetingStatus) => void;
  onResume: () => void;
};

/**
 * One meeting on the board: who is coming, when, who is briefing them and what the record
 * is still waiting for. The title stretches over the whole card so the card is the link,
 * while the move menu and the readiness ring stay above it and clickable in their own right.
 */
export function BoardCard({ meeting, now, index, reduce, dragging, pending, onDragStart, onDragEnd, onMove, onResume }: BoardCardProps) {
  const org = meeting.orgShortName ?? meeting.orgName;
  const others = meeting.countryCodes.filter((code) => code !== meeting.countryCode);

  return (
    // Native drag lives on the <li>; the entrance animation lives inside it, so Motion's own
    // drag gesture props never collide with the HTML5 ones.
    <li draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-status={meeting.status} data-dragging={dragging || undefined} aria-busy={pending || undefined}>
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionTransition({ duration: 0.28, delay: Math.min(index * 0.03, 0.18), ease: [0.22, 1, 0.36, 1] })}
        className={cn(
          "group/card relative isolate cursor-grab rounded-xl border bg-card p-2.5 shadow-soft transition-[transform,box-shadow,border-color,opacity] duration-200 ease-out",
          "hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-within:border-primary/50",
          "active:cursor-grabbing motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          meeting.ochAttending && "border-gold/60",
          dragging && "rotate-[0.6deg] opacity-60 shadow-lg",
          pending && "opacity-70",
        )}
      >
        <div className="flex items-start gap-2">
          <Flag code={meeting.countryCode} size={12} className="mt-1" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.8125rem] leading-tight font-semibold">
              <span className="truncate">{org}</span>
              {others.length > 0 ? (
                <span title={`Also ${others.join(", ")}`} className="shrink-0 rounded bg-muted px-1 text-[0.625rem] font-semibold text-muted-foreground tabular-nums">
                  +{others.length}
                </span>
              ) : null}
              {meeting.ochAttending ? (
                <span className="inline-flex shrink-0 items-center">
                  <Star className="size-3 fill-gold text-gold" aria-hidden />
                  <span className="sr-only">OCH attending</span>
                </span>
              ) : null}
            </p>
            <Link
              href={`/meetings/${meeting.id}`}
              draggable={false}
              className="text-xs leading-snug text-muted-foreground after:absolute after:inset-0 after:rounded-xl hover:text-foreground focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              <span className="line-clamp-2">{meeting.title}</span>
              <span className="sr-only">
                {" — "}
                {meeting.code}, {meeting.countryName}, {STATUS_LABELS[meeting.status]}
              </span>
            </Link>
          </div>
          <div className="relative z-10 flex shrink-0 items-center gap-0.5">
            <ReadinessRing readiness={meeting.readiness} size={18} />
            <MoveMenu code={meeting.code} status={meeting.status} previousStatus={meeting.previousStatus} onMove={onMove} onResume={onResume} disabled={pending} />
          </div>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {meeting.scheduledStart ? (
            <time dateTime={meeting.scheduledStart.toISOString()} className="font-medium text-foreground">
              {formatRange(meeting.scheduledStart, meeting.scheduledEnd)}
            </time>
          ) : (
            <CandidateDates dates={meeting.candidateDates} max={2} />
          )}
        </p>

        {meeting.waiting ? <WaitingOnChip waiting={meeting.waiting} className="relative z-10 mt-2 max-w-full" /> : null}

        <div className="mt-2 flex items-center justify-between gap-2">
          <ExpertAvatars experts={meeting.experts} max={3} className="relative z-10" />
          <span className="flex shrink-0 items-baseline gap-1.5 text-[0.625rem] text-muted-foreground">
            <time dateTime={meeting.updatedAt.toISOString()} title={`Updated ${formatDateNY(meeting.updatedAt, "full")}`}>
              {relativeAge(meeting.updatedAt, now)}
            </time>
            <span aria-hidden>·</span>
            <span className="numeric">{meeting.code}</span>
          </span>
        </div>
      </motion.div>
    </li>
  );
}
