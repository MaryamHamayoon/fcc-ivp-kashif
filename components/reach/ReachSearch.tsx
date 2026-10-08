"use client";

import { Building2, Search } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, type Ref, useId, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Flag } from "@/components/common/Flag";
import { useApplePlatform } from "@/components/shell/SearchButton";
import { Input } from "@/components/ui/input";
import { searchReach, type SearchEntry } from "@/lib/domain/reach";
import { cn } from "@/lib/utils";

export type ReachSearchHandle = { focus: () => void };

export type ReachSearchProps = {
  ref?: Ref<ReachSearchHandle>;
  /** Every country and foreign organization in the program's history, not only the window's. */
  entries: readonly SearchEntry[];
  /** The screen selects the country (an organization selects its country) and flies there. */
  onChoose: (entry: SearchEntry) => void;
  className?: string;
};

const LABEL = "Find a country or organization";
export const NO_MATCHES = "No country or organization matches";
const LIMIT = 8;

/**
 * The full screen's search: a WAI-ARIA 1.2 combobox that finds a country or
 * organization anywhere in the program's history, not only the window on screen. Choosing an
 * entry hands it to the screen, which selects the country — an organization selects its own —
 * and flies there; the field clears and keeps the keyboard focus, ready for the next one.
 */
export function ReachSearch(props: ReachSearchProps) {
  const { ref, entries, onChoose, className } = props;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const mac = useApplePlatform();

  const matches = useMemo(() => searchReach(entries, text, LIMIT), [entries, text]);
  const showList = open && matches.length > 0;
  const showEmpty = open && matches.length === 0;
  const listId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const activeOption = showList && activeIndex >= 0 ? matches[activeIndex] : undefined;

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);

  const reset = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const choose = (entry: SearchEntry) => {
    onChoose(entry);
    setText("");
    reset();
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setText(value);
    setActiveIndex(-1);
    setOpen(value.trim() !== "");
  };

  const move = (delta: 1 | -1) => {
    const n = matches.length;
    if (n === 0) return;
    setActiveIndex((i) => (i < 0 ? (delta === 1 ? 0 : n - 1) : (i + delta + n) % n));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Enter": {
        if (matches.length === 0) break;
        event.preventDefault();
        const entry = activeIndex >= 0 ? matches[activeIndex] : matches[0];
        if (entry) choose(entry);
        break;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          reset();
        } else if (text !== "") {
          event.preventDefault();
          setText("");
        }
        break;
      default:
        break;
    }
  };

  // 19rem holds the placeholder clear of the hint at every text size, and grows with it. A strip short of room
  // takes width back, and the placeholder ends in an ellipsis rather than running under the hint.
  return (
    <div className={cn("relative w-[19rem] min-w-0", className)}>
      <label htmlFor={id} className="sr-only">
        {LABEL}
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
        aria-autocomplete="list"
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={activeOption ? optionId(activeIndex) : undefined}
        autoComplete="off"
        placeholder={LABEL}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={reset}
        className="h-8 w-full rounded-md border-input bg-background pr-16 pl-8 text-[0.8125rem] text-ellipsis focus-visible:ring-2 focus-visible:ring-ring"
      />
      {text === "" ? (
        <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border border-border bg-muted px-1.5 py-px font-mono text-[0.625rem] leading-[1.4] text-muted-foreground">
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      ) : null}

      {showList ? (
        <ul id={listId} role="listbox" aria-label={LABEL} data-rail-surface="" className="glass absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto py-1">
          {matches.map((entry, index) => (
            <li
              key={`${entry.kind}:${entry.cca2}:${entry.label}`}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(entry);
              }}
              className={cn("flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[0.8125rem] hover:bg-muted/60", index === activeIndex && "bg-primary/10")}
            >
              <Flag code={entry.cca2} size={14} />
              {entry.kind === "organization" ? <Building2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" /> : null}
              <span className="min-w-0 flex-1 truncate">
                {entry.label}
                {entry.kind === "organization" ? <span className="sr-only">, organization</span> : null}
              </span>
              <span className="shrink-0 truncate text-[0.6875rem] text-muted-foreground">{entry.hint}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Always in the page, so a screen reader hears the words arrive; seen only while nothing matches. */}
      <p role="status" data-rail-surface="" className={showEmpty ? "glass absolute inset-x-0 top-full z-20 mt-1 px-3 py-2 text-[0.8125rem] text-muted-foreground" : "sr-only"}>
        {showEmpty ? NO_MATCHES : null}
      </p>
    </div>
  );
}
