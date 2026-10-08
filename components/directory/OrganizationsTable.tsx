"use client";

import { ChevronRight, SearchX } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { Flag } from "@/components/common/Flag";
import { Button } from "@/components/ui/button";
import { formatDateNY } from "@/lib/format";
import type { OrganizationSummary } from "@/lib/services/directory";
import { cn } from "@/lib/utils";
import { ContactsList } from "./ContactsList";

export type OrganizationRowData = OrganizationSummary & { contacts: { id: string; name: string; title: string | null; email: string | null; phone: string | null }[] };

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
 * The organizations as one table, set like the experts': the short name a reader would say, the
 * full one under it, then where it is from, what it is and how much the program has seen of it.
 * A row opens in place onto its contacts. It draws no box of its own: the workspace sets it in
 * one card with the pages under it. Columns leave as the table narrows.
 */
export function OrganizationsTable({
  organizations,
  hasFilters = false,
  onClearFilters,
  isPending = false,
}: {
  organizations: OrganizationRowData[];
  hasFilters?: boolean;
  onClearFilters?: () => void;
  /** The next list is on its way; this one dims until it lands. */
  isPending?: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (organizations.length === 0) {
    return hasFilters ? (
      <EmptyState
        icon={SearchX}
        className="rounded-none border-0 bg-transparent"
        title="No organization matches."
        description="Try another spelling, or the country it is from."
        action={
          onClearFilters ? (
            <Button type="button" variant="outline" onClick={onClearFilters}>
              Clear search
            </Button>
          ) : null
        }
      />
    ) : (
      <EmptyState className="rounded-none border-0 bg-transparent" title="No organizations on file yet." description="Organizations appear here once a meeting request names one." />
    );
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div aria-busy={isPending || undefined} className={cn("@container overflow-x-auto transition-opacity duration-200", isPending && "opacity-60")}>
      <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
        <caption className="sr-only">Organizations and their contacts</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(HEAD, "w-10 pr-0 pl-3")}>
              <span className="sr-only">Contacts, shown or hidden</span>
            </th>
            <th scope="col" className={cn(HEAD, "pl-1.5")}>
              Organization
            </th>
            <th scope="col" className={cn(HEAD, "hidden @2xl:table-cell")}>
              Country
            </th>
            <th scope="col" className={cn(HEAD, "hidden @4xl:table-cell")}>
              Kind
            </th>
            <th scope="col" className={cn(HEAD, "hidden text-right @3xl:table-cell")}>
              Contacts
            </th>
            <th scope="col" className={cn(HEAD, "text-right")}>
              Meetings
            </th>
            <th scope="col" className={cn(HEAD, "hidden pr-4 @5xl:table-cell")}>
              Last engaged
            </th>
          </tr>
        </thead>
        <tbody>
          {organizations.map((org) => {
            const isOpen = expanded.has(org.id);
            const panelId = `org-contacts-${org.id}`;
            const spoken = org.shortName ?? org.name;
            // Open, the row and its contacts read as one block: the rule moves under the contacts.
            const cell = cn(CELL, isOpen && "border-b-transparent");
            return (
              <Fragment key={org.id}>
                <tr className={cn("transition-colors hover:bg-muted/50 focus-within:bg-muted/50", isOpen && "bg-muted/40")}>
                  <td className={cn(cell, "pr-0 pl-3")}>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggle(org.id)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <ChevronRight aria-hidden className={cn("size-4 transition-transform duration-200", isOpen && "rotate-90")} />
                      <span className="sr-only">{isOpen ? `Hide contacts for ${spoken}` : `Show contacts for ${spoken}`}</span>
                    </button>
                  </td>
                  <th scope="row" className={cn(cell, "pl-1.5 text-left font-normal")}>
                    <span className="block max-w-52 @xl:max-w-xs @4xl:max-w-sm @6xl:max-w-lg">
                      <Link href={`/directory/organizations/${org.id}`} className="block truncate rounded-sm font-medium text-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                        {spoken}
                      </Link>
                      {org.shortName ? (
                        <span title={org.name} className="block truncate text-xs text-muted-foreground">
                          {org.name}
                        </span>
                      ) : null}
                    </span>
                  </th>
                  <td className={cn(cell, "hidden @2xl:table-cell")}>
                    {org.countryName ? (
                      <span className="flex items-center gap-2">
                        {org.countryCode ? <Flag code={org.countryCode} size={13} /> : null}
                        <span>{org.countryName}</span>
                      </span>
                    ) : (
                      <Missing>No country on file</Missing>
                    )}
                  </td>
                  <td className={cn(cell, "hidden text-muted-foreground @4xl:table-cell")}>{org.kindLabel}</td>
                  <td className={cn(cell, "numeric hidden text-right text-muted-foreground @3xl:table-cell")}>{org.contacts.length}</td>
                  <td className={cn(cell, "numeric text-right font-medium")}>{org.meetingCount}</td>
                  <td className={cn(cell, "hidden pr-4 text-muted-foreground @5xl:table-cell")}>
                    {org.lastMeetingAt ? <time dateTime={org.lastMeetingAt.toISOString()}>{formatDateNY(org.lastMeetingAt)}</time> : <Missing>Never engaged</Missing>}
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="bg-muted/40">
                    <td className="border-b border-border/70" />
                    <td colSpan={6} id={panelId} className="border-b border-border/70 pt-1 pr-4 pb-4 pl-1.5 whitespace-normal">
                      <ContactsList contacts={org.contacts} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
