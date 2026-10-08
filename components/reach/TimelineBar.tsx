"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { SectionBar } from "@/components/common/SectionBar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { isRangeKey, RANGE_KEYS, RANGE_LABELS, type RangeKey } from "@/lib/domain/reach-time";
import { cn } from "@/lib/utils";

/**
 * The timeline's title bar: its name and the window as a fact ("56 meetings · Jan 1 – Dec 31,
 * 2026"), with Clear selection while the reader has narrowed the window. On the right, the six
 * calendar ranges (toggles with fixed names, like the card's pair), then whatever the timeline
 * adds after them. Under 768 px (`compact`) the ranges fold into a menu named by the range in
 * force. Tucked to its strip of marks, the timeline hides the bar from sight but keeps
 * it in reach, so focus arriving on it grows the timeline back.
 */
export function TimelineBar({
  titleId,
  fact,
  range,
  onRange,
  narrowed,
  onClear,
  compact = false,
  className,
  children,
}: {
  titleId: string;
  fact: string;
  range: RangeKey;
  onRange: (range: RangeKey) => void;
  narrowed: boolean;
  onClear: () => void;
  compact?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const ranges = useRef<HTMLDivElement>(null);
  // Clear selection takes itself away, which would drop focus onto the page, so focus moves on to the range in
  // force: its pressed button, or under 768 px the menu that names it.
  const clear = () => {
    onClear();
    ranges.current?.querySelector<HTMLElement>('[aria-pressed="true"], [aria-haspopup]')?.focus();
  };
  return (
    <SectionBar
      title="Timeline"
      titleId={titleId}
      icon={<CalendarDays />}
      className={cn("pl-4", className)}
      note={
        <>
          {fact}
          {narrowed ? (
            <button type="button" onClick={clear} className="ms-2 rounded-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Clear selection
            </button>
          ) : null}
        </>
      }
    >
      <div ref={ranges} role="group" aria-label="Range" className={compact ? "flex" : "inline-flex h-7 items-center rounded-md border bg-card p-0.5 text-xs"}>
        {compact ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 text-xs font-medium whitespace-nowrap text-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {RANGE_LABELS[range]}
              <ChevronDown aria-hidden className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6}>
              <DropdownMenuRadioGroup
                value={range}
                onValueChange={(value) => {
                  if (isRangeKey(value)) onRange(value);
                }}
              >
                {RANGE_KEYS.map((key) => (
                  <DropdownMenuRadioItem key={key} value={key} closeOnClick>
                    {RANGE_LABELS[key]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          RANGE_KEYS.map((key) => (
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
          ))
        )}
      </div>
      {children}
    </SectionBar>
  );
}
