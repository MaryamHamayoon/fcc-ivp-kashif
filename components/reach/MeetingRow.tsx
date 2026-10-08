"use client";

import { useId } from "react";
import { Flag } from "@/components/common/Flag";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormatGlyph } from "@/components/geo/FormatGlyph";
import { countryLabel, meetingName, type ReachMeeting } from "@/lib/domain/reach";
import { FORMAT_LABELS } from "@/lib/domain/types";
import type { AgeBand } from "@/lib/domain/waiting-on";
import { countOf, formatNY } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A wait's age in the colors the activity log gives it. */
export const AGE_TEXT: Record<AgeBand, string> = { ok: "text-age-ok", warn: "text-age-warn", alert: "text-age-alert" };

/** What the row shows beyond its name, in words: "60% ready, waiting on Embassy of Japan for 6 business days". */
function rowDescription(m: ReachMeeting): string {
  const ready = `${Math.round(m.readiness)}% ready`;
  return m.waiting ? `${ready}, waiting on ${m.waiting.label} for ${countOf(m.waiting.businessDays, "business day")}` : ready;
}

/** Readiness as a slim bar with its percent beside it, in the tones of the readiness ring. The percent says it; the bar only shows it. */
export function ReadinessBar({ percent, className }: { percent: number; className?: string }) {
  const value = Math.round(Math.min(100, Math.max(0, percent)));
  const tone = value === 100 ? "bg-ok" : value >= 50 ? "bg-primary" : "bg-warn";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className="block h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </span>
      <span className="numeric text-[0.6875rem] leading-4 text-muted-foreground">
        {value}%<span className="sr-only"> ready</span>
      </span>
    </span>
  );
}

/** The month over the day, in Washington time; a dashed edge while the date is only proposed, a dash without one. */
function DateBlock({ start, proposed }: { start: Date | null; proposed: boolean }) {
  const block = cn("flex size-10 shrink-0 flex-col items-center justify-center rounded-md border leading-none", proposed && "border-dashed border-muted-foreground/60");
  if (!start) return <span className={cn(block, "text-sm text-muted-foreground")}>—</span>;
  return (
    <time dateTime={start.toISOString()} className={block}>
      <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">{formatNY(start, { month: "short" })}</span>
      <span className="numeric mt-1 text-[0.9375rem] font-semibold">{formatNY(start, { day: "numeric" })}</span>
    </time>
  );
}

/**
 * One meeting as a row, in Next up and in a country's view: a date block, flag and country with
 * the format on the right, the organization, then status, readiness, who it is waiting on, and
 * whether the date is firm. The row is one button, named in words and described by its readiness
 * and wait; pointing at it or focusing it lights its first country on the map.
 */
export function MeetingRow({ meeting, nameOf, onChoose, onPoint }: { meeting: ReachMeeting; nameOf: (cca2: string) => string; onChoose: (id: string) => void; onPoint: (cca2: string | null) => void }) {
  const descriptionId = useId();
  const first = meeting.countries[0] ?? null;
  const { waiting } = meeting;
  return (
    <button
      type="button"
      aria-label={meetingName(meeting, nameOf)}
      aria-describedby={descriptionId}
      onClick={() => onChoose(meeting.id)}
      onPointerEnter={() => onPoint(first)}
      onPointerLeave={() => onPoint(null)}
      onFocus={() => onPoint(first)}
      onBlur={() => onPoint(null)}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <DateBlock start={meeting.start} proposed={meeting.proposed} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <Flag code={first ?? "US"} size={11} />
          <span className="truncate text-[0.8125rem] leading-5 font-medium">{countryLabel(meeting, nameOf)}</span>
          <span className="ms-auto inline-flex shrink-0 items-center gap-1 text-[0.6875rem] text-muted-foreground">
            <FormatGlyph format={meeting.format} size={9} />
            {FORMAT_LABELS[meeting.format]}
          </span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{meeting.orgName}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <StatusBadge status={meeting.status} />
          <ReadinessBar percent={meeting.readiness} />
          {waiting ? (
            <span className={cn("max-w-full truncate text-[0.6875rem] leading-4 font-medium", AGE_TEXT[waiting.band])}>
              Waiting on {waiting.label} · {waiting.businessDays}d
            </span>
          ) : null}
          {meeting.proposed ? <span className="text-[0.6875rem] leading-4 text-muted-foreground">Date not confirmed</span> : null}
        </span>
      </span>
      <span id={descriptionId} hidden>
        {rowDescription(meeting)}
      </span>
    </button>
  );
}
