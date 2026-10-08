"use client";

import { Menu } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionUser } from "@/lib/auth/session";
import { type NavCounts, navGroupsFor } from "./nav";
import { RailNav } from "./NavTree";
import { UserMenu } from "./UserMenu";

/**
 * Hamburger + sheet for viewports under 768px, where the rail is hidden. The sheet is the rail:
 * same surface, same tree, same account block — so every destination stays reachable on a phone.
 * It carries `data-rail-surface` so the hybrid appearance dresses it in the dark tokens too.
 */
export function MobileNav({ user, counts }: { user: SessionUser; counts: NavCounts }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Menu className="size-5" strokeWidth={1.75} aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" data-rail-surface="" className="flex w-[17rem] flex-col gap-0 border-sidebar-border bg-sidebar p-0 pt-4 text-sidebar-foreground">
        <SheetHeader className="gap-2 px-3 pb-3 pr-12 pt-0 text-left">
          <div className="flex items-center gap-2.5">
            <Image src="/brand/fcc-seal.svg" alt="" width={32} height={32} className="size-8 shrink-0" />
            <SheetTitle className="heading-display min-w-0 text-[0.875rem] font-semibold leading-[1.15] text-sidebar-foreground">International Visitors Program</SheetTitle>
          </div>
          <SheetDescription className="sr-only">Primary navigation</SheetDescription>
        </SheetHeader>
        {/* `relative`: the sr-only spans in the count pills are absolutely positioned, and in an
            unpositioned scroller they would measure against the page and inflate its height. */}
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <RailNav groups={navGroupsFor(user)} onNavigate={() => setOpen(false)} counts={counts} />
        </div>
        <div className="border-t border-sidebar-border p-2">
          <UserMenu user={user} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
