"use client";

import { Check, ChevronDown } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/** One choosable value in a toolbar filter. */
export type FilterOption = {
  value: string;
  label: string;
  hint?: string;
  /** A short form — a bureau's code — set ahead of the label in the list, and alone on the button once chosen. */
  short?: string;
};

export const labelOf = (options: FilterOption[], value: string) => options.find((option) => option.value === value)?.label ?? value;

/** What the button says is chosen: the short form where there is one. */
const chosenText = (options: FilterOption[], value: string) => {
  const option = options.find((candidate) => candidate.value === value);
  return option?.short ?? option?.label ?? value;
};

/** The filter button's text: the name, then the chosen value in bold when there is one. */
function TriggerLabel({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      {/* The space is for the button's spoken name: "Bureau WTB", not "BureauWTB". */}
      <span className={cn(value && "text-muted-foreground")}>{label}</span>{" "}
      {value ? <span className="max-w-32 truncate font-semibold">{value}</span> : null}
      <ChevronDown className="size-3 opacity-50" aria-hidden />
    </>
  );
}

/** An outline button that fills when its filter is set; shared by every popover trigger and toggle chip. */
const triggerClass = (active: boolean) => cn(buttonVariants({ variant: "outline", size: "sm" }), active && "border-primary/40 bg-accent text-accent-foreground");

function OptionRow({ label, hint, selected, onSelect }: { label: string; hint?: string; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      {selected ? <Check className="size-3.5 shrink-0 text-primary" aria-hidden /> : null}
    </button>
  );
}

/** One value at a time, written to the URL under `param`; long lists (countries, people, topics) get a cmdk search box. */
export function SelectFilter({
  label,
  param,
  allLabel,
  allHint,
  options,
  params,
  setFilter,
  searchable = false,
  align = "start",
}: {
  label: string;
  param: string;
  allLabel: string;
  /** The tally beside the "all" row, where the other rows carry one. */
  allHint?: string;
  options: FilterOption[];
  params: URLSearchParams;
  setFilter: (patch: ParamPatch) => void;
  searchable?: boolean;
  /** Which edge of the button the list lines up with; "end" for a filter at the right of its bar. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const current = params.get(param);
  // A searchable list with codes ahead of its names (bureaus) holds long names; give them the room.
  const coded = searchable && options.some((option) => option.short);
  const choose = (value: string | null) => {
    setOpen(false);
    setFilter({ [param]: value });
  };

  const groupRef = useRef<HTMLDivElement | null>(null);
  // Row 0 is "all"; a chosen option sits one past its own index, in the same order as the rows below.
  const selectedIndex = current ? options.findIndex((option) => option.value === current) + 1 : 0;

  /** Base UI calls this once the popup — and so the rows — has mounted, so the list opens on the chosen row instead of always the first. */
  function openingFocus(): HTMLElement | true {
    const rows = groupRef.current?.querySelectorAll<HTMLButtonElement>("button");
    return rows?.[selectedIndex] ?? true;
  }

  /** ArrowDown/Up travel the rows and Home/End jump to the ends, clamped rather than wrapping; every other key — Tab, Enter, Space, Escape — is left to its native behaviour. */
  function onGroupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
    const from = rows.findIndex((row) => row === document.activeElement);
    const last = rows.length - 1;
    const to = event.key === "ArrowDown" ? Math.min(from + 1, last) : event.key === "ArrowUp" ? Math.max(from - 1, 0) : event.key === "Home" ? 0 : event.key === "End" ? last : null;
    if (to === null) return;
    event.preventDefault();
    rows[to]?.focus();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClass(Boolean(current))}>
        <TriggerLabel label={label} value={current ? chosenText(options, current) : null} />
      </PopoverTrigger>
      {/* To a screen reader the popup is a dialog, and one with no name is announced as just "dialog"; the rows inside keep their own label. */}
      <PopoverContent aria-label={label} align={align} initialFocus={searchable ? undefined : openingFocus} className={cn("gap-0 p-0", coded ? "w-96 max-w-[calc(100vw-2rem)]" : "w-64")}>
        {searchable ? (
          <Command label={label}>
            <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__all" onSelect={() => choose(null)}>
                  {allLabel}
                </CommandItem>
                {options.map((option) => (
                  <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => choose(option.value)} data-checked={option.value === current}>
                    {option.short ? <span className="w-11 shrink-0 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground">{option.short}</span> : null}
                    <span title={coded ? option.label : undefined} className="min-w-0 flex-1 truncate">
                      {option.label}
                    </span>
                    {option.hint ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{option.hint}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div ref={groupRef} role="group" aria-label={label} onKeyDown={onGroupKeyDown} className="max-h-72 overflow-y-auto p-1">
            <OptionRow label={allLabel} hint={allHint} selected={!current} onSelect={() => choose(null)} />
            {options.map((option) => (
              <OptionRow key={option.value} label={option.label} hint={option.hint} selected={option.value === current} onSelect={() => choose(option.value)} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
