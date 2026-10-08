"use client";

import { List, Map as MapIcon, Maximize } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { RegionSelect } from "@/components/common/RegionSelect";
import { buttonVariants } from "@/components/ui/button";
import type { CardRangeKey } from "@/lib/domain/reach";
import { RANGE_LABELS } from "@/lib/domain/reach-time";
import { cn } from "@/lib/utils";

export type MapView = "map" | "list";
export type MapRegionOption = { name: string; countries: number };

/** The card's two ranges, in the order the toggle reads. */
const CARD_RANGES: readonly CardRangeKey[] = ["next30", "this"];

/** How each range reads inside a sentence: "No meetings in the next 30 days", "Nothing more this year". */
export const RANGE_WHEN: Record<CardRangeKey, string> = { next30: "in the next 30 days", this: "this year" };

/** The full screen, opened on what the card shows: its range, and its region or one country. */
export function reachHref({ range, region = null, country = null }: { range: CardRangeKey; region?: string | null; country?: string | null }): string {
  const query = new URLSearchParams();
  if (country) query.set("country", country);
  query.set("range", range);
  if (region) query.set("region", region);
  return `/reach?${query}`;
}

/** The order the regions read in when the data has them; anything else follows in the data's own order. */
const PREFERRED = ["Americas", "Europe", "Africa", "Middle East & North Africa", "Asia-Pacific"];

export function orderRegions(names: readonly string[]): string[] {
  const seen = new Set(names);
  const first = PREFERRED.filter((name) => seen.has(name));
  return [...first, ...names.filter((name) => !first.includes(name))];
}

/**
 * The card's controls, set in its title bar: where the map looks (one region, or the world it
 * starts on), which meetings it counts, whether it is drawn or tabled, and the way into the full
 * screen, which opens on the same range and region. The view button names where it goes, so it
 * carries no pressed state; the range is a pair of toggles with fixed names.
 */
export function MapControls({
  range,
  onRange,
  view,
  onView,
  regions,
  worldCount,
  region,
  onRegion,
  className,
}: {
  range: CardRangeKey;
  onRange: (range: CardRangeKey) => void;
  /** Null when this browser cannot draw the map: the list is all there is, so there is nothing to switch. */
  view: MapView | null;
  onView: (view: MapView) => void;
  regions: MapRegionOption[];
  /** Countries the range counts across every region: the tally beside "World". */
  worldCount: number;
  /** The region in view by its full name; null is the whole world. */
  region: string | null;
  onRegion: (region: string | null) => void;
  className?: string;
}) {
  const options = useMemo(() => orderRegions(regions.map((r) => r.name)).map((name) => ({ name, count: regions.find((r) => r.name === name)?.countries ?? 0 })), [regions]);

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-1.5", className)}>
      <RegionSelect regions={options} allLabel="World" allCount={worldCount} value={region} onChange={onRegion} align="end" />

      <div role="group" aria-label="Range" className="inline-flex h-7 items-center rounded-md border bg-card p-0.5 text-xs">
        {CARD_RANGES.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={range === key}
            onClick={() => onRange(key)}
            className={cn(
              "inline-flex h-full items-center rounded-sm px-2 font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              range === key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>

      {view === null ? null : (
        <button type="button" onClick={() => onView(view === "list" ? "map" : "list")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {view === "list" ? <MapIcon aria-hidden /> : <List aria-hidden />}
          {view === "list" ? "Map" : "List"}
        </button>
      )}

      <Link href={reachHref({ range, region })} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <Maximize aria-hidden />
        Full screen
      </Link>
    </div>
  );
}
