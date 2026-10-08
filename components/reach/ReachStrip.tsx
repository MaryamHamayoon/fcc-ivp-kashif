"use client";

import { Ellipsis, Minimize, Play, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openPreferences } from "@/lib/preferences/open";
import { EDGE, STRIP_HEIGHT } from "@/lib/reach/layout";
import { cn } from "@/lib/utils";
import { awayTo, SLIDE } from "./away";
import { tourLabel } from "./Tour";

/**
 * The full screen's banner, floating across the top: the seal, the page's one h1, and the window
 * as a fact where there is room for it (from 1500 px; the timeline's bar says it at every width).
 * Then the page's own tools, the app's Display & accessibility panel, and the way out. Under
 * 768 px (`compact`) Display moves into the strip's menu, and while the search is open across the
 * strip (`searching`) the title steps out of sight, still the page's h1. There is no theme switch
 * here: the page follows the app's preferences. While the tour runs it is `away`: slid up out of
 * sight and out of reach.
 */
export function ReachStrip({ fact, away = false, compact = false, searching = false, children }: { fact: string; away?: boolean; compact?: boolean; searching?: boolean; children?: ReactNode }) {
  return (
    <header inert={away} data-rail-surface="" className={cn("glass absolute z-20 flex items-center gap-2 pr-2 pl-3", SLIDE)} style={{ top: EDGE, left: EDGE, right: EDGE, height: STRIP_HEIGHT, transform: awayTo("top", away) }}>
      <Image src="/brand/fcc-seal.svg" alt="" width={28} height={28} priority className="size-7 shrink-0" />
      <h1 className={cn("heading-display shrink-0 text-[0.9375rem] leading-none", searching && "sr-only")}>Global reach</h1>
      <p className="ms-1 hidden truncate border-l ps-3 text-xs text-muted-foreground min-[1500px]:block">{fact}</p>
      {searching ? null : <div aria-hidden className="flex-1" />}
      {children}
      <span aria-hidden className="mx-1 h-5 w-px bg-border" />
      {compact ? null : (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Display & accessibility" onClick={() => openPreferences()} />}>
            <SlidersHorizontal aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">Display &amp; accessibility</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger render={<Link href="/" aria-label="Exit full screen" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-muted-foreground")} />}>
          <Minimize aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">Exit full screen</TooltipContent>
      </Tooltip>
    </header>
  );
}

/** The strip's menu under 768 px: the tour, and Display & accessibility, which give up their own buttons to it. */
export function StripMenu({ ref, count, onTour }: { ref?: Ref<HTMLButtonElement>; count: number; onTour: () => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger ref={ref} aria-label="More" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "text-muted-foreground")} />}>
          <Ellipsis aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="bottom">More</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
        <DropdownMenuItem disabled={count === 0} onClick={onTour}>
          <Play aria-hidden />
          {tourLabel(count)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => openPreferences()}>
          <SlidersHorizontal aria-hidden />
          Display &amp; accessibility
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
