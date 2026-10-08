"use client";

import { SearchX, Users } from "lucide-react";
import type { MouseEvent } from "react";
import { UserAvatar } from "@/components/common/Avatar";
import { CopyButton } from "@/components/common/CopyButton";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import type { ExpertSort } from "@/lib/domain/directory-query";
import { formatDateNY } from "@/lib/format";
import type { ExpertSummary } from "@/lib/services/directory";
import { cn } from "@/lib/utils";

/** How many topics a row names before the rest become a count; the profile lists them all. */
const TOPICS_IN_ROW = 2;

const HEAD = "h-9 border-b bg-card px-3 text-left text-[0.6875rem] font-semibold tracking-[0.08em] whitespace-nowrap text-muted-foreground uppercase";
const CELL = "border-b border-border/70 px-3 py-2 align-middle whitespace-nowrap";

/** A dash for the eye, the reason for a screen reader. */
function Missing({ children }: { children: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-foreground/70">
        —
      </span>
      <span className="sr-only">{children}</span>
    </>
  );
}

/**
 * The roster as one table, a person to a row. Columns leave as the table narrows — the written
 * address first, then the date, the topics, the reply time, the bureau, the engagements — until
 * a phone is left with who (the bureau's code riding under the name) and the copy button. A
 * name, or anywhere on its row, opens that person's profile card, which has all of it.
 */
export function ExpertsTable({
  experts,
  maxEngagements,
  sort,
  onOpen,
  hasFilters,
  onClearFilters,
  isPending = false,
  className,
}: {
  experts: ExpertSummary[];
  /** The busiest person in the whole list, not just this page, so the bars mean the same on every page. */
  maxEngagements: number;
  sort: ExpertSort;
  onOpen: (expert: ExpertSummary) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
  /** The next list is on its way; this one dims until it lands. */
  isPending?: boolean;
  className?: string;
}) {
  if (experts.length === 0) {
    return hasFilters ? (
      <EmptyState
        icon={SearchX}
        className={cn("rounded-none border-0 bg-transparent", className)}
        title="No one matches."
        description="Try another spelling, or look across every bureau."
        action={
          <Button type="button" variant="outline" onClick={onClearFilters}>
            Clear search and filters
          </Button>
        }
      />
    ) : (
      <EmptyState icon={Users} className={cn("rounded-none border-0 bg-transparent", className)} title="No experts on file yet." description="People appear here once the staff directory has been loaded." />
    );
  }

  const openFromRow = (event: MouseEvent<HTMLTableRowElement>, expert: ExpertSummary) => {
    // Links and buttons on the row answer for themselves.
    if ((event.target as HTMLElement).closest("a, button")) return;
    onOpen(expert);
  };

  return (
    <div aria-busy={isPending || undefined} className={cn("@container overflow-x-auto transition-opacity duration-200", isPending && "opacity-60", className)}>
      <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
        <caption className="sr-only">FCC experts and points of contact</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={sort === "name" ? "ascending" : undefined} className={cn(HEAD, "pl-4")}>
              Name
            </th>
            <th scope="col" className={cn(HEAD, "hidden @xl:table-cell")}>
              Bureau
            </th>
            <th scope="col" className={cn(HEAD, "hidden @5xl:table-cell")}>
              Expertise
            </th>
            <th scope="col" aria-sort={sort === "engagements" ? "descending" : undefined} className={cn(HEAD, "hidden text-right @md:table-cell")}>
              Engagements
            </th>
            <th scope="col" className={cn(HEAD, "hidden text-right @3xl:table-cell")}>
              Avg reply
            </th>
            <th scope="col" className={cn(HEAD, "hidden @min-[76rem]:table-cell")}>
              Last briefed
            </th>
            <th scope="col" className={cn(HEAD, "pr-4 text-right")}>
              Email
            </th>
          </tr>
        </thead>
        <tbody>
          {experts.map((expert) => {
            const rest = expert.expertise.slice(TOPICS_IN_ROW);
            const share = maxEngagements > 0 ? Math.round((expert.engagements / maxEngagements) * 100) : 0;
            return (
              <tr key={expert.id} onClick={(event) => openFromRow(event, expert)} className="group/row cursor-pointer transition-colors hover:bg-muted/50 focus-within:bg-muted/50">
                <th scope="row" className={cn(CELL, "pl-4 text-left font-normal")}>
                  <span className="flex items-center gap-3">
                    <UserAvatar name={expert.name} size="md" decorative className="ring-0" />
                    <span className="min-w-0 max-w-52 @md:max-w-44 @xl:max-w-52 @3xl:max-w-64">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={() => onOpen(expert)}
                        className="block max-w-full truncate rounded-sm text-left font-medium text-foreground group-hover/row:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {expert.name}
                      </button>
                      {expert.title || expert.bureauCode ? (
                        <span className={cn("block truncate text-xs text-muted-foreground", !expert.title && "@xl:hidden")}>
                          {/* Until there is room for a Bureau column, the code rides here. */}
                          {expert.bureauCode ? <span className="font-semibold tracking-wide text-foreground/80 @xl:hidden">{expert.bureauCode}</span> : null} {expert.title}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </th>

                <td className={cn(CELL, "hidden @xl:table-cell")}>
                  {expert.bureauCode ? (
                    // The code is what the building says; the name under it is for everyone else.
                    <span className="block max-w-44">
                      <span className="block text-xs font-semibold tracking-wide text-foreground">{expert.bureauCode}</span>{" "}
                      {expert.bureauName ? <span className="hidden truncate text-xs text-muted-foreground @min-[66rem]:block">{expert.bureauName}</span> : null}
                    </span>
                  ) : (
                    <Missing>No bureau on file</Missing>
                  )}
                </td>

                <td className={cn(CELL, "hidden @5xl:table-cell")}>
                  {expert.expertise.length > 0 ? (
                    <ul aria-label="Expertise" className="flex items-center gap-1">
                      {expert.expertise.slice(0, TOPICS_IN_ROW).map((topic) => (
                        <li key={topic.topicId} title={topic.name} className="max-w-32 truncate rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground @min-[76rem]:max-w-40">
                          {topic.name}
                        </li>
                      ))}
                      {rest.length > 0 ? (
                        <li title={rest.map((topic) => topic.name).join(", ")} className="shrink-0 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
                          +{rest.length}
                          <span className="sr-only"> more</span>
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <Missing>No briefings yet</Missing>
                  )}
                </td>

                <td className={cn(CELL, "hidden text-right @md:table-cell")}>
                  <span className="flex items-center justify-end gap-2.5">
                    <span aria-hidden className="block h-1 w-14 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-primary/75" style={{ width: `${share}%` }} />
                    </span>
                    <span className="numeric w-6 text-right font-medium">{expert.engagements}</span>
                  </span>
                </td>

                <td className={cn(CELL, "hidden text-right @3xl:table-cell")}>
                  {expert.avgReplyBusinessDays === null ? (
                    <Missing>No replies yet</Missing>
                  ) : (
                    <>
                      <span className="numeric">{expert.avgReplyBusinessDays.toFixed(1)}</span> <span className="text-muted-foreground">days</span>
                    </>
                  )}
                </td>

                <td className={cn(CELL, "hidden text-muted-foreground @min-[76rem]:table-cell")}>
                  {expert.lastBriefedAt ? <time dateTime={expert.lastBriefedAt.toISOString()}>{formatDateNY(expert.lastBriefedAt)}</time> : <Missing>Never briefed</Missing>}
                </td>

                <td className={cn(CELL, "py-1 pr-2.5 text-right")}>
                  <span className="flex items-center justify-end gap-1">
                    <a
                      href={`mailto:${expert.email}`}
                      className="hidden max-w-52 truncate rounded-sm text-muted-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none @min-[84rem]:inline"
                    >
                      {expert.email}
                    </a>
                    <CopyButton iconOnly value={expert.email} what="email address" whose={expert.name} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
