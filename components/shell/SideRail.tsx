"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth/session";
import { setPreferences, usePreferences } from "@/lib/preferences/store";
import { cn } from "@/lib/utils";
import { type NavCounts, navGroupsFor } from "./nav";
import { RailNav } from "./NavTree";
import { UserMenu } from "./UserMenu";

/** Every focusable thing in the rail wears the same ring, offset against the rail's own surface. */
const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

/** The program lockup, at the head of the rail — the only branding in the shell. */
export function RailBrand({ collapsed = false }: { collapsed?: boolean }) {
  const className = cn("block rounded-md px-3 pb-3 pt-4", FOCUS_RING, collapsed && "px-0 text-center");
  const inner = (
    <span className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
      <Image src="/brand/fcc-seal.svg" alt="" width={32} height={32} priority className="size-8 shrink-0" />
      {!collapsed ? (
        <span className="min-w-0">
          <span className="heading-display block text-[0.875rem] leading-[1.15] text-sidebar-foreground">International</span>
          <span className="heading-display block text-[0.875rem] leading-[1.15] text-sidebar-foreground">Visitors Program</span>
        </span>
      ) : null}
    </span>
  );
  if (!collapsed) {
    return (
      <Link href="/" aria-label="International Visitors Program — home" className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href="/" aria-label="International Visitors Program — home" className={className} />}>{inner}</TooltipTrigger>
      <TooltipContent side="right">International Visitors Program</TooltipContent>
    </Tooltip>
  );
}

/**
 * Desktop rail: brand, then the navigation tree; the account block and the collapse control sit
 * at the foot, where a reader looks for them once and never again. Search, New meeting and the
 * display controls live in the top bar above the page — this column is navigation and nothing
 * else. Hidden under 768px, where the top bar's sheet takes over.
 *
 * Two independent choices shape it. Its style is the reader's `nav` preference (Display &
 * accessibility → Navigation): standard, or floating clear of the page edges. Whether it is
 * folded down to icons is `collapsed`, set from the foot button here — so a floating rail that
 * is collapsed is still floating. Placement and width are CSS keyed on `html[data-nav]` and
 * `html[data-collapsed]` (app/globals.css), which the boot script stamps before first paint, so
 * a reader who left it collapsed never sees the wide rail flash by; React only decides what the
 * rows contain. `data-rail-surface` is where the hybrid appearance hangs its dark tokens.
 */
export function SideRail({ user, counts }: { user: SessionUser; counts: NavCounts }) {
  const collapsed = usePreferences().collapsed === "yes";
  const groups = navGroupsFor(user);

  const toggle = () => setPreferences({ collapsed: collapsed ? "no" : "yes" });

  const collapseButton = (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
      className={cn("flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[0.7813rem] font-medium text-sidebar-muted transition-colors hover:bg-muted hover:text-sidebar-foreground", FOCUS_RING, collapsed && "justify-center px-0")}
    >
      {collapsed ? (
        <ChevronsRight className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      ) : (
        <>
          <ChevronsLeft className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
          <span>Collapse</span>
        </>
      )}
    </button>
  );

  return (
    <aside
      aria-label="Sidebar"
      data-side-rail=""
      data-rail-surface=""
      className="sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
    >
      <RailBrand collapsed={collapsed} />
      <RailNav groups={groups} collapsed={collapsed} counts={counts} />
      <div aria-hidden className="flex-1" />
      <div className="border-t border-sidebar-border p-2">
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger render={collapseButton} />
            <TooltipContent side="right">Expand navigation</TooltipContent>
          </Tooltip>
        ) : (
          collapseButton
        )}
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </aside>
  );
}
