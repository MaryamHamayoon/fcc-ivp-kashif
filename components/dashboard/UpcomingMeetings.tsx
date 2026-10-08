import { CalendarClock, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/common/Avatar";
import { Flag } from "@/components/common/Flag";
import { SectionBar } from "@/components/common/SectionBar";
import { ReadinessGlyph } from "@/components/meetings/ReadinessRing";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { FORMAT_LABELS, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatNY, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEK = 7 * 86_400_000;

/** How near a meeting is, which is what its date leaf is dressed by. */
type Nearness = "today" | "soon" | "later";

const LEAF: Record<Nearness, { leaf: string; month: string }> = {
  today: { leaf: "border-primary bg-primary text-primary-foreground", month: "text-primary-foreground" },
  soon: { leaf: "border-primary/30 bg-primary/[0.07] text-primary", month: "text-primary" },
  later: { leaf: "border-border bg-card text-foreground", month: "text-muted-foreground" },
};

/** The day in words where words are shorter than a date: "Today", "Tomorrow", else the weekday. */
function dayWord(start: Date, now: Date): string {
  const relative = relativeAge(start, now);
  if (relative === "today") return "Today";
  if (relative === "tomorrow") return "Tomorrow";
  return formatNY(start, { weekday: "short" });
}

function nearness(start: Date, now: Date): Nearness {
  if (relativeAge(start, now) === "today") return "today";
  return start.getTime() - now.getTime() < WEEK ? "soon" : "later";
}

/** The date as a calendar leaf: the month over the day, filled for today and tinted for this week. */
function DateLeaf({ start, now }: { start: Date; now: Date }) {
  const near = nearness(start, now);
  const tone = LEAF[near];
  return (
    <time
      dateTime={start.toISOString()}
      title={formatDateNY(start, "day")}
      data-when={near}
      className={cn("flex size-9 shrink-0 flex-col items-center justify-center rounded-md border leading-none", tone.leaf)}
    >
      <span className={cn("text-[0.625rem] leading-3 font-semibold", tone.month)}>{formatNY(start, { month: "short" })}</span>{" "}
      <span className="text-[0.9375rem] leading-[1.125rem] font-semibold tabular-nums">{formatNY(start, { day: "numeric" })}</span>
    </time>
  );
}

function UpcomingRow({ meeting, now }: { meeting: MeetingListItem; now: Date }) {
  const start = meeting.scheduledStart;
  if (!start) return null;
  const others = meeting.countryCodes.filter((code) => code !== meeting.countryCode);
  return (
    <li className="group">
      <Link
        href={`/meetings/${meeting.id}`}
        className="flex items-center gap-3 py-3 pr-4 pl-5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <DateLeaf start={start} now={now} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <Flag code={meeting.countryCode} size={11} />
            <span className="truncate text-sm font-medium text-foreground">
              {meeting.orgShortName ?? meeting.orgName} · {meeting.countryName}
            </span>
            {others.length > 0 ? (
              <span title={`Also ${others.join(", ")}`} className="shrink-0 rounded-sm bg-muted px-1 text-[0.625rem] font-semibold text-muted-foreground tabular-nums">
                +{others.length}
              </span>
            ) : null}
            {meeting.ochAttending ? (
              <>
                <Star aria-hidden className="size-3 shrink-0 fill-gold text-gold" />
                <span className="sr-only">OCH attending</span>
              </>
            ) : null}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {dayWord(start, now)}, {formatDateNY(start, "time")} · {FORMAT_LABELS[meeting.format]} · {STATUS_LABELS[meeting.status]}
          </span>
        </span>
        <ReadinessGlyph percent={meeting.readiness.percent} />
        {meeting.leadName ? (
          <UserAvatar name={meeting.leadName} size="xs" label={`Lead: ${meeting.leadName}`} className="hidden sm:inline-flex" />
        ) : (
          <span role="img" aria-label="No lead assigned" className="hidden size-6 shrink-0 rounded-full border border-dashed border-muted-foreground/50 sm:inline-flex" />
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * What is coming, soonest first: the next meetings on the calendar, each led by its date, with
 * a link to the whole Upcoming view. Beside the map the card is given the map's height; the
 * service sends only as many rows as fit it, so the list does not scroll.
 */
export function UpcomingMeetings({ meetings, total, now, className }: { meetings: MeetingListItem[]; total: number; now: Date; className?: string }) {
  return (
    <section id="upcoming" aria-labelledby="upcoming-heading" className={cn("flex scroll-mt-20 flex-col overflow-hidden rounded-md border bg-card shadow-soft", className)}>
      <SectionBar title="Upcoming meetings" titleId="upcoming-heading" icon={<CalendarClock />} count={total} countLabel={total === 1 ? "meeting ahead" : "meetings ahead"}>
        {total > meetings.length ? (
          <Link href="/meetings?view=upcoming" className="inline-flex h-7 items-center rounded-sm px-2 text-[0.8125rem] font-semibold text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            View all {total}
          </Link>
        ) : null}
      </SectionBar>
      {meetings.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-5 text-sm text-muted-foreground">
          <CalendarClock className="size-4" aria-hidden />
          No meetings are scheduled ahead.
        </p>
      ) : (
        // `relative`: rows carry visually hidden text, and an unpositioned scroller lets it stretch the page.
        <ol aria-label="Upcoming meetings" className="relative min-h-0 flex-1 divide-y overflow-y-auto">
          {meetings.map((meeting) => (
            <UpcomingRow key={meeting.id} meeting={meeting} now={now} />
          ))}
        </ol>
      )}
    </section>
  );
}
