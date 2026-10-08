"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type RecordTabCounts = {
  people: number;
  documents: number;
  /** Unresolved waiting-on entries — the only count that means "someone owes something". */
  activity: number;
};

const TABS: { segment: string; label: string; countKey: keyof RecordTabCounts | null }[] = [
  { segment: "", label: "Overview", countKey: null },
  { segment: "people", label: "People", countKey: "people" },
  { segment: "schedule", label: "Schedule", countKey: null },
  { segment: "agenda", label: "Agenda", countKey: null },
  { segment: "documents", label: "Documents", countKey: "documents" },
  { segment: "activity", label: "Activity", countKey: "activity" },
];

/**
 * The record's six sections. Counts appear only where they are cheap and mean something:
 * how many briefers, how many files, and how many threads are still waiting on somebody —
 * the last of which is deliberately louder than the rest.
 */
export function RecordTabs({ basePath, counts, className }: { basePath: string; counts: RecordTabCounts; className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Meeting sections" className={cn("-mb-px overflow-x-auto border-b", className)}>
      <ul className="flex min-w-max items-center gap-1">
        {TABS.map((tab) => {
          const href = tab.segment === "" ? basePath : `${basePath}/${tab.segment}`;
          const active = tab.segment === "" ? pathname === basePath : pathname === href || pathname.startsWith(`${href}/`);
          const count = tab.countKey === null ? null : counts[tab.countKey];
          const loud = tab.segment === "activity" && count !== null && count > 0;

          return (
            <li key={tab.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {tab.label}
                {count !== null && count > 0 ? (
                  <span className={cn("numeric rounded-full px-1.5 py-px text-[0.625rem] font-semibold tabular-nums", loud ? "bg-warn/15 text-warn" : "bg-muted text-muted-foreground")}>{count}</span>
                ) : null}
                {active ? <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
