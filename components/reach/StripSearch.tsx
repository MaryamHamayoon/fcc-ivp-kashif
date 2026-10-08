"use client";

import { Search, X } from "lucide-react";
import { type FocusEvent, type KeyboardEvent, type Ref, useImperativeHandle, useRef } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SearchEntry } from "@/lib/domain/reach";
import { cn } from "@/lib/utils";
import { ReachSearch, type ReachSearchHandle } from "./ReachSearch";

const LABEL = "Find a country or organization";

type StripSearchProps = {
  ref?: Ref<ReachSearchHandle>;
  /** Under 768 px: a Search button stands for the field until the reader opens it. */
  compact: boolean;
  /** Whether the search is open across the strip. The screen keeps it, since the strip's title steps aside for it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: readonly SearchEntry[];
  onChoose: (entry: SearchEntry) => void;
};

/**
 * The strip's search. Wide, it is the search field. Under 768 px
 * a Search button stands for it: the button opens the field across the strip, with Close search
 * after it. The search is open while focus is in it, so a window that narrows while the reader is
 * typing keeps it open. Close search, or an Escape the field has not used, closes it and gives
 * focus back to the Search button. The field is one element at every width, so a change of width
 * never takes the reader's text or focus.
 */
export function StripSearch({ ref, compact, open, onOpenChange, entries, onChoose }: StripSearchProps) {
  const field = useRef<ReachSearchHandle>(null);
  const button = useRef<HTMLButtonElement>(null);
  const shown = !compact || open;

  // The field can take focus only once it is shown, and the button only once it is back: flushSync first.
  const openSearch = () => {
    flushSync(() => onOpenChange(true));
    field.current?.focus();
  };
  const closeSearch = () => {
    flushSync(() => onOpenChange(false));
    button.current?.focus({ preventScroll: true });
  };
  // Ctrl+K reaches the field at every width, opening it first where the button stands for it.
  useImperativeHandle(ref, () => ({ focus: () => (shown ? field.current?.focus() : openSearch()) }));

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!compact || event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    closeSearch();
  };

  return (
    <>
      {shown ? null : (
        <Tooltip>
          <TooltipTrigger render={<Button ref={button} variant="ghost" size="icon" aria-label={LABEL} onClick={openSearch} className="text-muted-foreground" />}>
            <Search aria-hidden />
          </TooltipTrigger>
          <TooltipContent side="bottom">{LABEL}</TooltipContent>
        </Tooltip>
      )}
      <div hidden={!shown} onFocus={() => onOpenChange(true)} onBlur={onBlur} onKeyDown={onKeyDown} className={cn("flex min-w-0 items-center gap-1", compact && "flex-1")}>
        <ReachSearch ref={field} entries={entries} onChoose={onChoose} className={compact ? "w-auto min-w-0 flex-1" : undefined} />
        {compact ? (
          <Tooltip>
            <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Close search" onClick={closeSearch} className="text-muted-foreground" />}>
              <X aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom">Close search</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </>
  );
}
