"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/** One filter in force: what it is called, the value it holds, and what removing it writes to the URL. */
export type ActiveChip = {
  id: string;
  label: string;
  value?: string;
  patch: ParamPatch;
};

/**
 * Every filter in force as a "Label · Value" chip that removes only itself, then one Reset for
 * the lot. Renders nothing when nothing is set, so the row it sits in closes up.
 */
export function FilterChips({ chips, onChange, onClearAll, className }: { chips: ActiveChip[]; onChange: (patch: ParamPatch) => void; onClearAll: () => void; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.patch)}
          className="group/chip inline-flex h-6 items-center gap-1 rounded-md border border-primary/25 bg-accent/60 pr-1 pl-2 text-[0.6875rem] font-medium text-accent-foreground transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {chip.value ? (
            <>
              <span className="text-muted-foreground">{chip.label}</span> <span className="text-muted-foreground/60">·</span> <span>{chip.value}</span>
            </>
          ) : (
            <span>{chip.label}</span>
          )}
          <X className="size-3 text-muted-foreground transition-colors group-hover/chip:text-foreground" aria-hidden /> <span className="sr-only">remove</span>
        </button>
      ))}
      <Button type="button" variant="ghost" size="xs" onClick={onClearAll} className="text-primary">
        Reset
      </Button>
    </div>
  );
}
