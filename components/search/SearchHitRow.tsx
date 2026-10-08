import { Flag } from "@/components/common/Flag";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { SearchHit } from "@/lib/services/search";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./kind";

/** The visual for one hit; the palette and the results page wrap it in their own interactive element. */
export function SearchHitRow({ hit, compact = false, className }: { hit: SearchHit; compact?: boolean; className?: string }) {
  const Icon = KIND_ICON[hit.kind];
  /** A meeting or a document belongs to a country without being one: its flag sits beside the icon, not in place of it. */
  const flagBeside = hit.kind === "meeting" || hit.kind === "document";
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-3", className)}>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {hit.countryCode && !flagBeside ? <Flag code={hit.countryCode} size={14} /> : <Icon className="size-4" aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate font-medium", compact ? "text-sm" : "text-[0.9375rem]")}>{hit.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
      </span>
      {flagBeside && hit.countryCode ? <Flag code={hit.countryCode} size={12} className="hidden sm:inline-block" /> : null}
      {hit.status ? <StatusBadge status={hit.status} className={cn(compact && "hidden sm:inline-flex")} /> : null}
    </span>
  );
}
