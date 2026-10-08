"use client";

import Link from "next/link";
import { useScrollEdges } from "@/components/common/useScrollEdges";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ScopeTab = {
  id: string;
  label: string;
  href: string;
  active: boolean;
  /** How many the tab would show; null while that is still being counted. */
  count?: number | null;
  title?: string;
};

/**
 * The coarse cut of a list, one tab each, with the count each would show. Real links, so a
 * scope is a URL. The active tab underlines the hairline beneath the row.
 */
export function ScopeTabs({ label, tabs, loading = false, className }: { label: string; tabs: ScopeTab[]; loading?: boolean; className?: string }) {
  const { ref, start, end } = useScrollEdges<HTMLElement>();
  return (
    <nav ref={ref} aria-label={label} data-fade={start && end ? "both" : start ? "start" : end ? "end" : undefined} className={cn("scroll-fade-x -my-1 flex items-stretch gap-0.5 overflow-x-auto", className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          title={tab.title}
          // Toolbar rule: tab strips use aria-current="page"; menu rows (e.g. ViewsMenu) use aria-current="true".
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "relative inline-flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
            tab.active ? "text-foreground after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}{" "}
          {tab.count == null ? (
            loading ? (
              <span aria-hidden className="inline-block h-3 w-5 animate-pulse rounded bg-muted" />
            ) : null
          ) : (
            // The muted ink at full strength: faded to 80% it measured 3.67:1 on the card at this size, under AA's 4.5:1.
            <span className={cn("numeric text-[0.6875rem]", tab.active ? "text-primary" : "text-muted-foreground")}>{formatNumber(tab.count)}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}
