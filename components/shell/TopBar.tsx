"use client";

import { ChevronRight, SlidersHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth/session";
import { openPreferences } from "@/lib/preferences/open";
import { MobileNav } from "./MobileNav";
import { type NavCounts, type PageHeading, pageHeading } from "./nav";
import { NewMeetingButton } from "./NewMeetingButton";
import { SearchButton } from "./SearchButton";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Where you are: the section as the rail names it, its icon in a quiet tile, and — only when the
 * page below does not say it — the part of the section this page is. It is a label, not the
 * page's heading: the h1 stays inside `main`, where the skip link lands.
 */
function PageName({ heading }: { heading: PageHeading }) {
  const Icon = heading.icon;
  return (
    <p data-testid="page-name" className="flex min-w-0 items-center gap-2 md:gap-2.5 md:pl-0.5">
      <span aria-hidden className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary md:flex">
        <Icon aria-hidden className="size-[1.0625rem]" strokeWidth={1.9} />
      </span>
      <span className="heading-display truncate text-[0.875rem] leading-none md:text-[0.9375rem]">{heading.label}</span>
      {/* The second half of the name waits for a bar with room for it. */}
      {heading.detail ? (
        <>
          <ChevronRight aria-hidden className="hidden size-3.5 shrink-0 text-muted-foreground/70 @min-[34rem]/bar:block" />
          <span className="hidden truncate text-[0.8125rem] leading-none font-medium text-muted-foreground @min-[34rem]/bar:block">{heading.detail}</span>
        </>
      ) : null}
    </p>
  );
}

/**
 * The bar above the page: one card, the page's own width, sharing its gutters. The page's name
 * on the left, because that is where reading starts and the page under it no longer spends a
 * row saying so; on the right the things you *do* — search, file a meeting, change how the app
 * looks. Search and New meeting stand side by side at one height, a hairline from the rest.
 *
 * It sticks to the top of the viewport with a strip of page colour above it, so a long table
 * scrolls beneath a bar that looks placed rather than pinned. That strip is 0.75rem — the same
 * gap the floating rail keeps from the viewport's edge (app/globals.css), so the two tops share
 * a line; it is the bar's own measure, not the rail's, and holds when the rail is standard. On a
 * phone the rail is gone, so the bar also carries the hamburger and the seal as the way home.
 *
 * The root is a `<header>`, sitting outside `main`, so it maps to the page's one banner landmark —
 * everything in it (the page's name, search, New meeting) has to be reachable by landmark
 * navigation, not just by sight.
 */
export function TopBar({ user, canCreate, counts }: { user: SessionUser; canCreate: boolean; counts: NavCounts }) {
  const heading = pageHeading(usePathname(), useSearchParams());

  return (
    <header className="sticky top-0 z-30 bg-background pb-3 pt-3">
      {/* The bar answers to its own width, not the window's: the rail beside it may be wide, narrow or away. */}
      <div className="@container/bar surface flex h-12 items-center gap-1.5 px-2 md:h-[3.25rem] md:gap-2 md:px-3">
        <div className="flex shrink-0 items-center gap-1.5 md:hidden">
          <MobileNav user={user} counts={counts} />
          <Link
            href="/"
            aria-label="International Visitors Program — home"
            className="flex shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <Image src="/brand/fcc-seal.svg" alt="" width={24} height={24} priority className="size-6" />
          </Link>
        </div>

        {heading ? <PageName heading={heading} /> : null}

        <div aria-hidden className="flex-1" />

        {/* The field starts from 9rem and takes the spare room up to its full width, so in a short row it is the
            field that is smaller, never the page's name that is cut. */}
        <SearchButton className="hidden max-w-64 min-w-36 shrink-0 grow-[1000] basis-36 @min-[41rem]/bar:flex @min-[56rem]/bar:max-w-72 @min-[64rem]/bar:max-w-80" />
        <SearchButton variant="icon" className="@min-[41rem]/bar:hidden" />
        {canCreate ? <NewMeetingButton /> : null}
        <span aria-hidden className="mx-1 hidden h-5 w-px bg-border md:block" />
        <ThemeToggle className="hidden text-muted-foreground md:inline-flex" />
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Display & accessibility" onClick={() => openPreferences()} />}
          >
            <SlidersHorizontal aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">Display &amp; accessibility</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
