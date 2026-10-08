"use client";

import { ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import type { ActiveChip } from "@/components/common/FilterChips";
import { type FilterOption, labelOf } from "@/components/common/SelectFilter";
import { buttonVariants } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";

export type FilterGroup = {
  param: string;
  label: string;
  options: FilterOption[];
  /** Several values may be in force at once, written to the URL as repeated keys. */
  multi?: boolean;
};

/** A yes-or-no filter, written as `param=true`. */
export type FilterToggle = { param: string; label: string; hint?: string };

/** The values in force under one key, whichever way the URL spells them (repeated, or comma-separated). */
export function readValues(params: URLSearchParams, param: string): string[] {
  return params
    .getAll(param)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

/** How many filters are set across the groups and toggles. */
export function countActive(params: URLSearchParams, groups: FilterGroup[], toggles: FilterToggle[] = []): number {
  return groups.reduce((sum, group) => sum + readValues(params, group.param).length, 0) + toggles.filter((toggle) => params.get(toggle.param) === "true").length;
}

/** Every filter in force as a "Label · Value" chip, each carrying the patch that removes only itself. */
export function activeChips(params: URLSearchParams, groups: FilterGroup[], toggles: FilterToggle[] = []): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const group of groups) {
    const values = readValues(params, group.param);
    for (const value of values) {
      const rest = values.filter((other) => other !== value);
      chips.push({
        id: `${group.param}-${value}`,
        label: group.label,
        value: labelOf(group.options, value),
        patch: { [group.param]: group.multi && rest.length ? rest : null },
      });
    }
  }
  for (const toggle of toggles)
    if (params.get(toggle.param) === "true")
      chips.push({
        id: toggle.param,
        label: toggle.label,
        patch: { [toggle.param]: null },
      });
  return chips;
}

/**
 * cmdk's `aria-selected` marks the highlighted row, not the chosen one, so the only thing that
 * tells a screen reader a filter is in force is this. It sits outside the option's `value`, so
 * it never changes what typing matches.
 */
const IN_FORCE = <span className="sr-only">, in force</span>;

/** What a name's row says is set under it: the first value, and how many more. */
function summarize(labels: string[]): string {
  const [first, ...rest] = labels;
  if (first === undefined) return "";
  return rest.length ? `${first} +${rest.length}` : first;
}

/**
 * One button for every filter, in two steps. It opens on the filters' names alone — Status,
 * Region, Country — each saying what is already set under it; choosing a name shows that
 * filter's values, with a way back. The list never starts as a wall of every value there is.
 *
 * Typing on the first screen still searches everything: "ken" offers Kenya whichever filter it
 * sits under. Inside a filter, typing searches that filter only, and Backspace in an empty box
 * steps back. Picking a single-value filter closes the menu; statuses and toggles stay open,
 * since they are usually picked in twos.
 */
export function FilterMenu({
  groups,
  toggles = [],
  params,
  onChange,
  label = "Filter",
  placeholder = "Filter by anything…",
  className,
}: {
  groups: FilterGroup[];
  toggles?: FilterToggle[];
  params: URLSearchParams;
  onChange: (patch: ParamPatch) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [inside, setInside] = useState<string | null>(null);
  const active = countActive(params, groups, toggles);
  const group = groups.find((candidate) => candidate.param === inside) ?? null;

  const enter = (next: string | null) => {
    setInside(next);
    setQuery("");
  };

  const choose = (from: FilterGroup, value: string) => {
    const current = readValues(params, from.param);
    if (from.multi) {
      const next = current.includes(value) ? current.filter((other) => other !== value) : [...current, value];
      onChange({ [from.param]: next.length ? next : null });
      return;
    }
    onChange({ [from.param]: current[0] === value ? null : value });
    setOpen(false);
  };

  const flip = (toggle: FilterToggle) =>
    onChange({
      [toggle.param]: params.get(toggle.param) === "true" ? null : "true",
    });

  // The way back without leaving the keyboard: Backspace (or Left) in an empty box, as in any nested menu.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!group || query !== "") return;
    if (event.key !== "Backspace" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    enter(null);
  };

  const option = (from: FilterGroup, item: FilterOption, selected: string[]) => (
    <CommandItem key={`${from.param}-${item.value}`} value={`${from.label} ${item.label} ${item.hint ?? ""} ${item.value}`} onSelect={() => choose(from, item.value)} data-checked={selected.includes(item.value)}>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.hint ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{item.hint}</span> : null}
      {selected.includes(item.value) ? IN_FORCE : null}
    </CommandItem>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) enter(null);
      }}
    >
      <PopoverTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), active > 0 && "border-primary/40 bg-accent text-accent-foreground", className)}>
        <ListFilter aria-hidden />
        {label}{" "}
        {active > 0 ? (
          <>
            <span className="numeric inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-primary-foreground">{active}</span>{" "}
            <span className="sr-only">in force</span>
          </>
        ) : null}
      </PopoverTrigger>
      {/* To a screen reader the popup is a dialog, so it carries the menu's name. */}
      <PopoverContent aria-label={label} align="start" className="w-72 gap-0 p-0">
        <Command label={group ? `${label}: ${group.label}` : label} onKeyDown={onKeyDown}>
          {group ? (
            <div className="flex items-center gap-1 px-1 pt-1">
              <button
                type="button"
                onClick={() => enter(null)}
                aria-label="Back to all filters"
                className="inline-flex h-7 min-w-0 items-center gap-1 rounded-md pr-2 pl-1 text-[0.8125rem] font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronLeft aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{group.label}</span>
              </button>
              {readValues(params, group.param).length > 0 ? (
                <button
                  type="button"
                  onClick={() => onChange({ [group.param]: null })}
                  aria-label={`Clear ${group.label}`}
                  className="ms-auto inline-flex h-7 items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ) : null}
          <CommandInput placeholder={group ? `Search ${group.label.toLowerCase()}…` : placeholder} value={query} onValueChange={setQuery} />
          {/* Keyed by where we are, so each step arrives as its own list: scrolled to the top, first row lit. */}
          <CommandList key={group?.param ?? "names"} className={cn("max-h-96", group && "animate-in fade-in slide-in-from-right-2 duration-150")}>
            <CommandEmpty>No filter matches.</CommandEmpty>
            {group ? (
              <CommandGroup>{group.options.map((item) => option(group, item, readValues(params, group.param)))}</CommandGroup>
            ) : (
              <>
                <CommandGroup>
                  {groups.map((each) => {
                    const labels = readValues(params, each.param).map((value) => labelOf(each.options, value));
                    return (
                      <CommandItem key={each.param} value={each.label} onSelect={() => enter(each.param)}>
                        <span className="min-w-0 flex-1 truncate">{each.label}</span>
                        {labels.length > 0 ? <span className="sr-only">, in force: {labels.join(", ")}</span> : null}
                        {/* The shortcut slot is what tells the row to drop its check mark for this. */}
                        <span data-slot="command-shortcut" aria-hidden className="ml-auto flex max-w-[55%] shrink-0 items-center gap-1 text-xs">
                          {labels.length > 0 ? <span className="truncate font-medium text-primary">{summarize(labels)}</span> : null}
                          <ChevronRight className="size-3.5 text-muted-foreground/70" />
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {toggles.length > 0 ? (
                  <CommandGroup className="border-t">
                    {toggles.map((toggle) => (
                      <CommandItem key={toggle.param} value={`${toggle.label} ${toggle.hint ?? ""}`} onSelect={() => flip(toggle)} data-checked={params.get(toggle.param) === "true"}>
                        <span className="min-w-0 flex-1 truncate">{toggle.label}</span>
                        {toggle.hint ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{toggle.hint}</span> : null}
                        {params.get(toggle.param) === "true" ? IN_FORCE : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ) : null}
                {/* Nothing but names until something is typed; then every value is in reach at once. */}
                {query !== ""
                  ? groups.map((each) => (
                      <CommandGroup key={each.param} heading={each.label}>
                        {each.options.map((item) => option(each, item, readValues(params, each.param)))}
                      </CommandGroup>
                    ))
                  : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
