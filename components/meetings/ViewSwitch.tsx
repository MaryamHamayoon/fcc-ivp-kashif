"use client";

import { CalendarDays, LayoutGrid, Table2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { MeetingLayout, ParamPatch } from "./useMeetingsQuery";

const LAYOUTS = [
  { id: "table", label: "Table", icon: Table2 },
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
] as const satisfies readonly { id: MeetingLayout; label: string; icon: typeof Table2 }[];

/** Table / board / calendar as real links, so every layout is bookmarkable. */
export function ViewSwitch({ layout, hrefFor, className }: { layout: MeetingLayout; hrefFor: (patch: ParamPatch) => string; className?: string }) {
  return (
    <nav aria-label="Layout" className={cn("inline-flex h-7 items-center gap-0.5 rounded-md border bg-muted/50 p-0.5", className)}>
      {LAYOUTS.map(({ id, label, icon: Icon }) => {
        const active = layout === id;
        return (
          <Link
            key={id}
            href={hrefFor({ layout: id === "table" ? null : id })}
            aria-current={active ? "page" : undefined}
            title={`${label} view`}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-[5px] px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className="max-sm:sr-only">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
