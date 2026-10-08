"use client";

import { Activity, AlertTriangle, ArrowRightLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Clock, FileText, Mail, MessageSquare, Phone, RefreshCw, SearchX, Send, UserCheck } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { type ComponentType, type MouseEvent, useId, useState } from "react";
import { UserAvatar } from "@/components/common/Avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { Flag } from "@/components/common/Flag";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityFeedItem } from "@/lib/db/repos/activities";
import { dayKeyOf, groupByDay } from "@/lib/domain/activity-feed";
import { businessDaysBetween } from "@/lib/domain/business-days";
import { ACTIVITY_KIND_LABELS, type ActivityKind, STATUS_LABELS, WAITING_ON_LABELS } from "@/lib/domain/types";
import { ageBand, type AgeBand } from "@/lib/domain/waiting-on";
import { formatDateNY, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** The record's own vocabulary, so an entry wears the same mark here as on its meeting. */
const ICONS: Partial<Record<ActivityKind, IconType>> = {
  note: MessageSquare,
  email_out: Send,
  email_in: Mail,
  call: Phone,
  date_proposed: CalendarDays,
  date_confirmed: CalendarDays,
  expert_requested: UserCheck,
  expert_confirmed: UserCheck,
  expert_declined: UserCheck,
  document_added: FileText,
  status_change: ArrowRightLeft,
  hold: ArrowRightLeft,
  resume: ArrowRightLeft,
};

/** Lines IVP writes for itself; they sit a step quieter than what a person typed. */
const SYSTEM_KINDS = new Set<ActivityKind>(["status_change", "hold", "resume", "system"]);

const BAND: Record<AgeBand, { ring: string; dot: string; text: string }> = {
  ok: { ring: "border-age-ok/45 bg-age-ok/10 text-age-ok", dot: "bg-age-ok", text: "text-age-ok" },
  warn: { ring: "border-age-warn/50 bg-age-warn/12 text-age-warn", dot: "bg-age-warn", text: "text-age-warn" },
  alert: { ring: "border-age-alert/55 bg-age-alert/12 text-age-alert", dot: "bg-age-alert", text: "text-age-alert" },
};

/** "Marcus Bell" → "Marcus B." */
function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;
  return `${words[0]} ${words[words.length - 1]?.[0] ?? ""}.`;
}

/** The year is only worth its width once it is not this one. */
const dayOf = (date: Date, now: Date) => formatDateNY(date, dayKeyOf(date).slice(0, 4) === dayKeyOf(now).slice(0, 4) ? "monthday" : "short");

/**
 * One grid for every row, so times, kinds, meetings and names fall into columns a reader can run
 * an eye down. It is sized by the list's own width, not the window's: beside an open rail the
 * list is narrower than the screen, and the row folds when *it* runs out of room — one line on
 * a desk, two on a tablet (the meeting and the name under the note), three on a phone.
 */
const ROW =
  "grid grid-cols-[3.75rem_minmax(0,1fr)_1.75rem] items-start gap-x-3 px-3 py-1 @2xl:grid-cols-[3.75rem_8.5rem_minmax(0,1fr)_1.75rem] @4xl:grid-cols-[3.75rem_8.5rem_minmax(0,1fr)_12.5rem_6rem_1.75rem]";

/** Every cell's first line is as tall as the row's one control, so a row that opens keeps its columns on that line. */
const LINE = "flex h-7 items-center";

function Row({ item, now }: { item: ActivityFeedItem; now: Date }) {
  const panelId = useId();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  const Icon = ICONS[item.kind] ?? Activity;
  const kind = ACTIVITY_KIND_LABELS[item.kind];
  const time = formatDateNY(item.occurredAt, "time");
  const href = `/meetings/${item.meetingId}/activity`;
  // Entries the app writes for itself have no author; the record calls them the same thing.
  const author = item.authorName ?? "System";

  const waiting = item.waitingOn !== "none";
  const waitOpen = waiting && item.resolvedAt === null;
  const days = waitOpen ? businessDaysBetween(item.occurredAt, now) : 0;
  const band = BAND[ageBand(days)];
  // Same fallback the waiting-on engine uses, so the feed and the record never name it differently.
  const party = item.waitingOnLabel?.trim() || WAITING_ON_LABELS[item.waitingOn];

  function toggleFromRow(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    if ((event.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    setOpen((value) => !value);
  }

  return (
    <li className={cn("border-b border-border/70 transition-colors last:border-b-0", open ? "bg-muted/40" : "hover:bg-muted/40 focus-within:bg-muted/40")}>
      <div onClick={toggleFromRow} className={cn(ROW, "cursor-pointer")}>
        <time dateTime={item.occurredAt.toISOString()} title={formatDateNY(item.occurredAt, "full")} className={cn(LINE, "numeric text-xs whitespace-nowrap text-muted-foreground")}>
          {time}
        </time>

        <span className={cn(LINE, "min-w-0 gap-2")}>
          <span aria-hidden className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground", waitOpen && band.ring)}>
            <Icon className="size-3" aria-hidden />
          </span>
          <span className="truncate text-xs font-medium text-foreground">{kind}</span>
        </span>

        <div className="col-span-full flex min-w-0 items-start gap-2 @2xl:col-auto">
          {/* Closed, the note is one line; open, it is the whole note where it stood, never a second copy of it. */}
          <p
            title={open ? undefined : item.body}
            className={cn("min-w-0 flex-1 py-1 text-[0.8125rem] leading-5", open ? "break-words whitespace-pre-wrap" : "truncate", SYSTEM_KINDS.has(item.kind) ? "text-muted-foreground" : "text-foreground")}
          >
            {item.body}
          </p>
          {/* Open, the details say this in full; the note gets the width back. */}
          {waiting && !waitOpen && item.resolvedAt && !open ? (
            <span className={cn(LINE, "shrink-0 gap-1 text-xs text-muted-foreground")}>
              <Check className="size-3 text-ok" aria-hidden />
              <span>Resolved {dayOf(item.resolvedAt, now)}</span>
            </span>
          ) : null}
        </div>

        {waitOpen ? (
          <p className="col-span-full flex min-w-0 items-center gap-1.5 pb-1 text-xs @2xl:col-start-3 @2xl:col-end-4 @2xl:row-start-2 @4xl:col-end-6">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", band.dot)} />
            <span className={cn("truncate font-medium tabular-nums", band.text)}>
              Waiting on {party} · {days} business {days === 1 ? "day" : "days"}
            </span>
          </p>
        ) : null}

        <div className="col-span-full flex min-w-0 items-center gap-3 @2xl:col-start-3 @2xl:col-end-4 @4xl:contents">
          <Link href={href} title={item.meetingTitle} className={cn(LINE, "group/meeting min-w-0 gap-1.5 rounded-sm text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
            <Flag code={item.countryCode} size={11} />
            <span className="numeric shrink-0 font-medium text-foreground group-hover/meeting:text-primary">{item.meetingCode}</span>
            <span className="truncate text-muted-foreground">{item.orgName}</span>
          </Link>
          <span className={cn(LINE, "ms-auto min-w-0 gap-1.5 text-xs text-muted-foreground @4xl:ms-0")} title={author}>
            <UserAvatar name={author} size="xs" decorative className="size-5 text-[0.5625rem] ring-0" />
            <span className="truncate">{shortName(author)}</span>
          </span>
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Hide" : "Show"} details: ${kind}, ${item.meetingCode}, ${time}`}
          onClick={() => setOpen((value) => !value)}
          className="col-start-3 row-start-1 inline-flex size-7 items-center justify-center justify-self-end rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @2xl:col-start-4 @4xl:col-start-6"
        >
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="details"
            id={panelId}
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <Details item={item} now={now} author={author} party={party} days={days} band={band} waitOpen={waitOpen} href={href} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

const TERM = "text-muted-foreground";

/** The mark between a value and its aside; decoration, so assistive technology skips it. */
const Dot = () => (
  <span aria-hidden className="px-1.5 text-muted-foreground">
    ·
  </span>
);

/**
 * What the one line leaves out — which meeting, what happens next and by when, who is being
 * waited on, who logged it — set under the note, in the note's own column, with the way through
 * to the meeting's record.
 */
function Details({ item, now, author, party, days, band, waitOpen, href }: { item: ActivityFeedItem; now: Date; author: string; party: string; days: number; band: (typeof BAND)[AgeBand]; waitOpen: boolean; href: string }) {
  const waiting = item.waitingOn !== "none";

  return (
    // 14.5rem: the row's padding, its time and kind columns and the gaps between — where the note begins.
    <div className="px-3 pt-1 pb-3.5 text-xs @2xl:pr-12 @2xl:pl-[14.5rem]">
      <dl className="grid max-w-[46rem] grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-l-2 border-primary/25 pl-3.5 leading-5">
        <dt className={TERM}>Meeting</dt>
        <dd className="text-foreground">
          {item.meetingTitle}
          <Dot />
          <span className="text-muted-foreground">
            {item.countryName}, {STATUS_LABELS[item.meetingStatus]}
          </span>
        </dd>

        {item.nextAction ? (
          <>
            <dt className={TERM}>Next</dt>
            <dd className="text-foreground">
              {item.nextAction}
              {item.nextActionDueAt ? (
                <>
                  <Dot />
                  <span className="text-muted-foreground">
                    <Clock className="me-1 inline size-3 -translate-y-px" aria-hidden />
                    due {formatDateNY(item.nextActionDueAt, "short")}, {relativeAge(item.nextActionDueAt, now)}
                  </span>
                </>
              ) : null}
            </dd>
          </>
        ) : null}

        {waiting ? (
          <>
            <dt className={TERM}>Waiting on</dt>
            <dd className="text-foreground">
              {party}
              {waitOpen ? (
                <>
                  <Dot />
                  <span className={cn("font-medium tabular-nums", band.text)}>
                    open for {days} business {days === 1 ? "day" : "days"}
                  </span>
                </>
              ) : item.resolvedAt ? (
                <>
                  <Dot />
                  <span className="text-muted-foreground">
                    resolved {formatDateNY(item.resolvedAt, "short")}
                    {item.resolvedByName ? ` by ${item.resolvedByName}` : ""}
                  </span>
                </>
              ) : null}
            </dd>
          </>
        ) : null}

        <dt className={TERM}>Logged by</dt>
        <dd className="text-foreground">
          {author}
          <Dot />
          <span className="text-muted-foreground">{formatDateNY(item.occurredAt, "full")}</span>
        </dd>
      </dl>

      <Link href={href} className="mt-2.5 inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Open the meeting
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

function Day({ label, date, items, now }: { label: string; date: string | null; items: ActivityFeedItem[]; now: Date }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      {/* It sticks only where the list scrolls on its own; on a phone the page scrolls and the top bar owns that edge. */}
      <h2 className="z-10 flex items-baseline gap-2 border-b bg-muted/85 px-3 py-1.5 text-xs backdrop-blur-sm md:sticky md:top-0">
        <span id={labelId} className="font-semibold text-foreground">
          {label}
        </span>
        {date ? <span className="text-muted-foreground">{date}</span> : null}
      </h2>
      {/* Preflight strips the list style, and with it the role in Safari; say it again. */}
      <ul role="list">
        {items.map((item) => (
          <Row key={item.id} item={item} now={now} />
        ))}
      </ul>
    </div>
  );
}

export type ActivityListProps = {
  items: ActivityFeedItem[];
  now: Date;
  isLoading?: boolean;
  isError?: boolean;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onRetry?: () => void;
  className?: string;
};

/**
 * The program's log, one line to an entry, gathered under the Washington day it happened on.
 * A line says when, what kind, what, which meeting and who; a wait that is still open gets a
 * second line in the colour of its age, because that is the line a reader is scanning for.
 * Anything longer opens in place. How many matched is the toolbar's to announce.
 */
export function ActivityList({ items, now, isLoading = false, isError = false, hasFilters = false, onClearFilters, onRetry, className }: ActivityListProps) {
  if (isError) {
    return (
      <EmptyState
        icon={AlertTriangle}
        className={cn("rounded-none border-0 bg-transparent", className)}
        title="The log did not load."
        description="The connection dropped or the server is busy. Nothing has been lost — try again."
        action={
          onRetry ? (
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          ) : null
        }
      />
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <div aria-hidden className={cn("@container", className)}>
        <div className="border-b bg-muted/85 px-3 py-1.5">
          <Skeleton className="h-4 w-16" />
        </div>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={cn(ROW, "border-b border-border/70 py-2.5")}>
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="col-span-full mt-1 h-3.5 w-full max-w-xl @2xl:col-auto @2xl:mt-0" />
            <Skeleton className="hidden h-3.5 w-36 @4xl:block" />
            <Skeleton className="hidden h-3.5 w-16 @4xl:block" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        className={cn("rounded-none border-0 bg-transparent", className)}
        title="Nothing in the log matches."
        description={hasFilters ? "Clear a filter or widen the dates. Entries are logged on a meeting's Activity tab." : "Nothing has been logged yet. Entries are written on a meeting's Activity tab."}
        action={
          hasFilters && onClearFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className={cn("@container", className)}>
      {groupByDay(items, now).map((group) => (
        // "Today" and "Yesterday" are easier to read than a date and harder to cite; give both.
        <Day key={group.key} label={group.label} date={group.label === "Today" || group.label === "Yesterday" ? formatDateNY(group.items[0]?.occurredAt ?? now, "weekday") : null} items={group.items} now={now} />
      ))}
    </div>
  );
}
