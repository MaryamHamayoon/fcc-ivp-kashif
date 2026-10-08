"use client";

import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, RefreshCw, SearchX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { UserAvatar } from "@/components/common/Avatar";
import { EmptyState } from "@/components/common/EmptyState";
import { Flag } from "@/components/common/Flag";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { MeetingSort } from "@/lib/api/schemas";
import type { CsvColumn } from "@/lib/csv";
import type { MeetingListItem } from "@/lib/db/repos/meetings";
import { ACTIVE_STATUSES } from "@/lib/domain/status-machine";
import { EXPERT_STATUS_LABELS, STATUS_LABELS, WAITING_ON_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatRange, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CandidateDates } from "./CandidateDates";
import { useDensity } from "./density";
import { ExpertAvatars } from "./ExpertAvatars";
import { ReadinessRing } from "./ReadinessRing";
import { StatusPill } from "./StatusPill";
import { WaitingOnChip } from "./WaitingOnChip";

export { type Density, useDensity } from "./density";

/* --------------------------------- columns -------------------------------- */

export type MeetingColumnId = "date" | "country" | "topics" | "experts" | "status" | "waiting" | "readiness" | "lead" | "updated";

type Column = {
  id: MeetingColumnId;
  header: string;
  /** Present when the server can order by this column. */
  sort?: MeetingSort;
  /** The list makes no sense without it, so it never leaves the column chooser. */
  locked?: boolean;
  headClass?: string;
  cellClass?: string;
  cell: (meeting: MeetingListItem, now: Date) => ReactNode;
  csv: (now: Date) => CsvColumn<MeetingListItem>[];
};

const dash = <span className="text-muted-foreground">—</span>;

function CountryCell({ meeting }: { meeting: MeetingListItem }) {
  const others = meeting.countryCodes.filter((code) => code !== meeting.countryCode);
  return (
    <Link href={`/meetings/${meeting.id}`} className="flex items-start gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" data-row-link>
      <Flag code={meeting.countryCode} size={13} className="mt-1" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{meeting.countryName}</span>
          {others.length > 0 ? (
            <span title={`Also ${others.join(", ")}`} className="shrink-0 rounded bg-muted px-1 text-[0.625rem] font-semibold text-muted-foreground tabular-nums">
              +{others.length}
            </span>
          ) : null}
          {meeting.ochAttending ? (
            <>
              <span aria-hidden className="shrink-0 text-gold">
                ★
              </span>
              <span className="sr-only">OCH attending</span>
            </>
          ) : null}
        </span>
        <span className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          <span className="numeric shrink-0">{meeting.code}</span>
          <span aria-hidden>·</span>
          <span className="truncate">{meeting.orgShortName ?? meeting.orgName}</span>
        </span>
        <span className="sr-only">{meeting.title}</span>
      </span>
    </Link>
  );
}

const csvDate = (value: Date | null) => (value ? formatDateNY(value, "short") : "");

export const MEETING_COLUMNS: readonly Column[] = [
  {
    id: "date",
    header: "Date",
    sort: "date",
    locked: true,
    headClass: "w-40",
    cell: (m, now) => {
      if (!m.scheduledStart) return <CandidateDates dates={m.candidateDates} />;
      const isPastDate = m.scheduledStart.getTime() < now.getTime() && ACTIVE_STATUSES.includes(m.status);
      // "Sep 16, 2026 · 10:30 AM–12:00 PM" is the widest thing in any row; the day and the time
      // take a line each, so the date column stays as narrow as the country column beside it.
      const [day, time] = formatRange(m.scheduledStart, m.scheduledEnd).split(" · ");
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <time dateTime={m.scheduledStart.toISOString()} title={formatDateNY(m.scheduledStart, "full")} className="whitespace-nowrap">
            <span className="block font-medium">{day}</span>
            {time ? (
              <>
                <span className="sr-only"> · </span>
                <span className="block text-muted-foreground">{time}</span>
              </>
            ) : null}
          </time>
          {isPastDate ? (
            <span title="Accepted date has passed and the meeting is not completed" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warn/10 px-1.5 py-0.5 text-[0.625rem] font-semibold text-warn">
              <AlertTriangle aria-hidden className="size-3" />
              Past date
              <span className="sr-only"> — the accepted date has passed and the meeting is not completed</span>
            </span>
          ) : null}
        </span>
      );
    },
    csv: () => [
      { header: "Date", value: (m) => csvDate(m.scheduledStart) },
      { header: "Proposed dates", value: (m) => (m.scheduledStart ? "" : m.candidateDates.filter((d) => d.status === "proposed").map((d) => csvDate(d.start)).join("; ")) },
    ],
  },
  {
    id: "country",
    header: "Country / Org",
    sort: "country",
    locked: true,
    headClass: "w-56",
    cell: (m) => <CountryCell meeting={m} />,
    csv: () => [
      { header: "Country", value: (m) => m.countryName },
      { header: "Other countries", value: (m) => m.countryCodes.filter((c) => c !== m.countryCode).join("; ") },
      { header: "Organization", value: (m) => m.orgName },
      { header: "OCH attending", value: (m) => (m.ochAttending ? "Yes" : "No") },
    ],
  },
  {
    id: "topics",
    header: "Topics",
    headClass: "w-44",
    cell: (m) => {
      const shown = m.topics.slice(0, 1);
      const rest = m.topics.slice(1);
      if (shown.length === 0) return dash;
      return (
        <span className="flex items-center gap-1">
          {shown.map((topic) => (
            <span key={topic.id} title={topic.name} className="max-w-36 truncate rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
              {topic.name}
            </span>
          ))}
          {rest.length > 0 ? (
            <span title={rest.map((t) => t.name).join(", ")} className="shrink-0 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
              +{rest.length}
            </span>
          ) : null}
        </span>
      );
    },
    csv: () => [{ header: "Topics", value: (m) => m.topics.map((t) => t.name).join("; ") }],
  },
  {
    id: "experts",
    header: "Experts",
    headClass: "w-24",
    cell: (m) => <ExpertAvatars experts={m.experts} />,
    csv: () => [{ header: "Experts", value: (m) => m.experts.map((e) => `${e.name} (${EXPERT_STATUS_LABELS[e.status]})`).join("; ") }],
  },
  {
    id: "status",
    header: "Status",
    sort: "status",
    headClass: "w-28",
    cell: (m) => <StatusPill status={m.status} />,
    csv: () => [{ header: "Status", value: (m) => STATUS_LABELS[m.status] }],
  },
  {
    id: "waiting",
    header: "Waiting on",
    headClass: "w-40",
    cell: (m) => (m.waiting ? <WaitingOnChip waiting={m.waiting} /> : dash),
    csv: () => [
      { header: "Waiting on", value: (m) => (m.waiting ? `${m.waiting.label} (${WAITING_ON_LABELS[m.waiting.who]})` : "") },
      { header: "Business days waiting", value: (m) => m.waiting?.businessDays ?? "" },
    ],
  },
  {
    id: "readiness",
    header: "Readiness",
    sort: "readiness",
    headClass: "w-24",
    cell: (m) => <ReadinessRing readiness={m.readiness} />,
    csv: () => [{ header: "Readiness %", value: (m) => m.readiness.percent }],
  },
  {
    id: "lead",
    header: "Lead",
    headClass: "w-36",
    cell: (m) =>
      m.leadName ? (
        <span className="flex min-w-0 items-center gap-2">
          <UserAvatar name={m.leadName} size="xs" decorative />
          <span className="truncate">{m.leadName}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Unassigned</span>
      ),
    csv: () => [{ header: "Lead", value: (m) => m.leadName ?? "" }],
  },
  {
    id: "updated",
    header: "Updated",
    sort: "updated",
    headClass: "w-24",
    cell: (m, now) => (
      <time dateTime={m.updatedAt.toISOString()} title={formatDateNY(m.updatedAt, "full")} className="whitespace-nowrap text-muted-foreground">
        {relativeAge(m.updatedAt, now)}
      </time>
    ),
    csv: () => [{ header: "Updated", value: (m) => m.updatedAt }],
  },
];

export const DEFAULT_MEETING_COLUMNS: MeetingColumnId[] = MEETING_COLUMNS.map((c) => c.id);

/**
 * CSV for the visible columns, always led by the identifiers — a spreadsheet row nobody
 * can trace back to a meeting is worse than no export at all.
 */
export function meetingCsvColumns(visible: readonly MeetingColumnId[], now: Date): CsvColumn<MeetingListItem>[] {
  const identity: CsvColumn<MeetingListItem>[] = [
    { header: "IVP code", value: (m) => m.code },
    { header: "Meeting", value: (m) => m.title },
  ];
  const chosen = MEETING_COLUMNS.filter((column) => visible.includes(column.id)).flatMap((column) => column.csv(now));
  return [...identity, ...chosen];
}

/* ---------------------------------- table --------------------------------- */

export type SortDirection = "asc" | "desc";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

function SortButton({ column, active, dir, onSortChange }: { column: Column; active: boolean; dir: SortDirection; onSortChange: (sort: MeetingSort) => void }) {
  const sort = column.sort;
  if (!sort) return <>{column.header}</>;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => onSortChange(sort)}
      title={active ? `Sorted by ${column.header.toLowerCase()} — reverse the order` : `Sort by ${column.header.toLowerCase()}`}
      className="group/sort -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {column.header}
      <Icon aria-hidden className={cn("size-3 transition-opacity", active ? "text-primary opacity-100" : "opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60")} />
    </button>
  );
}

export type MeetingsTableProps = {
  items: MeetingListItem[];
  now: Date;
  sort: MeetingSort;
  dir: SortDirection;
  onSortChange: (sort: MeetingSort) => void;
  columns?: MeetingColumnId[];
  isLoading?: boolean;
  isError?: boolean;
  hasFilters?: boolean;
  onClearFilters?: () => void;
  onRetry?: () => void;
  /** The foot of the card: the pager. Left out while the list is empty or failed. */
  pagination?: ReactNode;
  /** A new page is being fetched; the rows on screen are the old ones and are dimmed until it lands. */
  isPlaceholder?: boolean;
  className?: string;
};

/**
 * The rows and their pager slot: the count, the density and the column chooser live in the
 * toolbar above. The card never scrolls vertically — the page does — and only a narrow screen
 * scrolls it sideways. Headers are small and tracked, identifiers are set in the mono face, and the
 * row height follows the reader's density choice.
 */
export function MeetingsTable({
  items,
  now,
  sort,
  dir,
  onSortChange,
  columns = DEFAULT_MEETING_COLUMNS,
  isLoading = false,
  isError = false,
  hasFilters = false,
  onClearFilters,
  onRetry,
  pagination,
  isPlaceholder = false,
  className,
}: MeetingsTableProps) {
  const router = useRouter();
  const density = useDensity();
  const visible = MEETING_COLUMNS.filter((column) => columns.includes(column.id));
  const cellPadding = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const sortedBy = MEETING_COLUMNS.find((column) => column.sort === sort)?.header.toLowerCase() ?? sort;

  function openRow(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    if ((event.target as HTMLElement).closest("a, button, input, [role='button']")) return;
    if (window.getSelection()?.toString()) return;
    router.push(`/meetings/${id}`);
  }

  return (
    <section aria-label="Meetings" aria-busy={isLoading || undefined} className={cn("overflow-hidden rounded-xl border bg-card shadow-soft", className)}>
      {isError ? (
        <EmptyState
          icon={AlertTriangle}
          className="rounded-none border-0 bg-transparent"
          title="The meetings list did not load."
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
      ) : !isLoading && items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          className="rounded-none border-0 bg-transparent"
          title="No meetings match these filters."
          description={hasFilters ? "Widen the search, or clear the filters to see the whole program." : "Nothing has been logged for this view yet."}
          action={
            hasFilters && onClearFilters ? (
              <Button type="button" variant="outline" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div aria-busy={isPlaceholder || undefined} className={cn("relative overflow-x-auto transition-opacity duration-200", isPlaceholder && "opacity-60")}>
          <table className="w-full min-w-[64rem] border-separate border-spacing-0 text-[0.8125rem]">
            <caption className="sr-only">
              Meetings, sorted by {sortedBy}, {dir === "asc" ? "ascending" : "descending"}
            </caption>
            <thead>
              <tr>
                {visible.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={column.sort ? (column.sort === sort ? ARIA_SORT[dir] : "none") : undefined}
                    className={cn("h-9 border-b bg-card px-3 text-left text-[0.6875rem] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase", column.headClass)}
                  >
                    <SortButton column={column} active={column.sort === sort} dir={dir} onSortChange={onSortChange} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody aria-label="Meetings">
              {isLoading && items.length === 0
                ? Array.from({ length: 8 }, (_, rowIndex) => (
                    <tr key={`skeleton-${rowIndex}`}>
                      {visible.map((column) => (
                        <td key={column.id} className={cn("border-b", cellPadding)}>
                          <Skeleton className="h-4 w-full max-w-40" />
                        </td>
                      ))}
                    </tr>
                  ))
                : items.map((meeting) => (
                    <tr key={meeting.id} onClick={(event) => openRow(event, meeting.id)} className="cursor-pointer transition-colors hover:bg-muted/50 focus-within:bg-muted/50">
                      {visible.map((column) => (
                        <td key={column.id} className={cn("border-b align-middle", cellPadding, column.cellClass)}>
                          {column.cell(meeting, now)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination}
    </section>
  );
}
