"use client";

import { FORMAT_COLORS } from "@/components/charts/FormatDonut";
import { Flag } from "@/components/common/Flag";
import { FORMAT_ORDER } from "@/lib/domain/reach";
import { FORMAT_LABELS } from "@/lib/domain/types";
import { countOf } from "@/lib/format";
import type { ScreenCountry } from "@/lib/reach/scene";
import { cn } from "@/lib/utils";

export const NO_COUNTRIES = "No meetings in this window. Widen the timeline or clear a filter.";

/** "1 in person, 1 hybrid": the formats in words, for the row's name, which the bar says only in color. */
const mixWords = (c: ScreenCountry): string =>
  FORMAT_ORDER.filter((format) => c.mix[format] > 0)
    .map((format) => `${c.mix[format]} ${FORMAT_LABELS[format].toLowerCase()}`)
    .join(", ");

/**
 * The window's countries ranked by meetings: flag, name and region, the count, and a bar as long
 * as the count is against the busiest country, split by format. Each row chooses its country, and
 * its name says it all in words: "Japan, Asia-Pacific, 2 meetings: 1 in person, 1 hybrid".
 * Pointing at a row, or focusing it, lights the country on the map.
 */
export function CountryList({
  countries,
  max,
  selected,
  onChoose,
  onPoint,
  className,
}: {
  countries: readonly ScreenCountry[];
  max: number;
  selected: string | null;
  onChoose: (cca2: string) => void;
  onPoint: (cca2: string | null) => void;
  className?: string;
}) {
  if (countries.length === 0) return <p className={cn("px-4 py-6 text-sm text-muted-foreground", className)}>{NO_COUNTRIES}</p>;
  return (
    <ol className={cn("divide-y", className)}>
      {countries.map((c) => (
        <li key={c.cca2}>
          <button
            type="button"
            aria-label={`${c.name}, ${c.region}, ${countOf(c.count, "meeting")}: ${mixWords(c)}`}
            aria-current={selected === c.cca2 ? "true" : undefined}
            onClick={() => onChoose(c.cca2)}
            onPointerEnter={() => onPoint(c.cca2)}
            onPointerLeave={() => onPoint(null)}
            onFocus={() => onPoint(c.cca2)}
            onBlur={() => onPoint(null)}
            className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 px-4 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset aria-[current=true]:bg-primary/10"
          >
            <Flag code={c.cca2} size={14} />
            <span className="min-w-0">
              <span className="block truncate text-[0.8125rem] font-medium leading-tight">{c.name}</span>
              <span className="block truncate text-[0.6875rem] text-muted-foreground">{c.region}</span>
            </span>
            <span className="numeric text-sm font-semibold">{c.count}</span>
            <span aria-hidden className="col-span-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="flex h-full" style={{ width: `${(c.count / Math.max(1, max)) * 100}%` }}>
                {FORMAT_ORDER.filter((format) => c.mix[format] > 0).map((format) => (
                  <span key={format} data-format={format} className="h-full" style={{ flexGrow: c.mix[format], backgroundColor: FORMAT_COLORS[format] }} />
                ))}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
