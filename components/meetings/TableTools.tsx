"use client";

import { SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { setDensity, useDensity } from "./density";
import { MEETING_COLUMNS, type MeetingColumnId } from "./MeetingsTable";

/** How the table is drawn — row height and which columns show. Lives in the toolbar, so the table itself is nothing but rows. */
export function TableTools({ columns, onColumnsChange, className }: { columns: MeetingColumnId[]; onColumnsChange: (columns: MeetingColumnId[]) => void; className?: string }) {
  const density = useDensity();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "icon-sm" }), className)} title="Rows and columns">
        <SlidersHorizontal aria-hidden />
        <span className="sr-only">Display</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* A label only names the group it sits in, so each heading and its items share one group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Rows</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked={density === "compact"} closeOnClick={false} onCheckedChange={(checked) => setDensity(checked ? "compact" : "comfortable")}>
            Compact rows
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Columns</DropdownMenuLabel>
          {MEETING_COLUMNS.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={columns.includes(column.id)}
              disabled={column.locked}
              closeOnClick={false}
              onCheckedChange={(checked) => onColumnsChange(checked ? [...columns, column.id] : columns.filter((id) => id !== column.id))}
            >
              {column.header}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
