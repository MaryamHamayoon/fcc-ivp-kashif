"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/**
 * A search box whose value lives in the URL under `q`. Typing is debounced into the query
 * string; a change arriving from the URL (a saved view, the Back button) is adopted at once.
 * `bare` drops the field's own frame for use inside a toolbar box that already draws one.
 */
export function SearchField({
  label,
  placeholder,
  params,
  setFilter,
  className,
  delay = 250,
  bare = false,
}: {
  label: string;
  placeholder: string;
  params: URLSearchParams;
  setFilter: (patch: ParamPatch) => void;
  className?: string;
  delay?: number;
  bare?: boolean;
}) {
  const id = useId();
  const urlQuery = params.get("q") ?? "";
  const [text, setText] = useState(urlQuery);
  const [pushed, setPushed] = useState(urlQuery);

  // The URL can change under us; adopt it without an effect.
  if (urlQuery !== pushed) {
    setPushed(urlQuery);
    setText(urlQuery);
  }

  useEffect(() => {
    const next = text.trim();
    if (next === pushed) return;
    const timer = setTimeout(() => {
      setPushed(next);
      setFilter({ q: next || null });
    }, delay);
    return () => clearTimeout(timer);
  }, [text, pushed, setFilter, delay]);

  return (
    <div className={cn("relative", bare ? "min-w-40" : "min-w-56 flex-1 md:max-w-sm", className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground", bare ? "left-2 size-3.5" : "left-3 size-4")} aria-hidden />
      <Input
        id={id}
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        className={cn(
          bare
            ? "h-7 rounded-md border-transparent bg-transparent pl-7 text-[0.8125rem] shadow-none placeholder:text-muted-foreground/80 hover:bg-muted/40 focus-visible:border-transparent focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring md:text-[0.8125rem] dark:bg-transparent"
            : "h-8 pl-9",
        )}
      />
    </div>
  );
}
