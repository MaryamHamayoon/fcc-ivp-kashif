"use client";

import { CircleDot, RotateCcw } from "lucide-react";
import { useId } from "react";
import { selectClass } from "@/components/meetings/wizard/fields";
import { ACTIVITY_KIND_LABELS, ACTIVITY_KINDS, type ActivityKind, type WaitingOn } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type WaitingParty = Exclude<WaitingOn, "none">;

export type ActivityFilter = {
  kind: ActivityKind | "all";
  waitingOn: WaitingParty | "all";
  /** Only entries that still name someone we are waiting on. */
  unresolvedOnly: boolean;
};

export const NO_FILTER: ActivityFilter = { kind: "all", waitingOn: "all", unresolvedOnly: false };

export const isFiltered = (filter: ActivityFilter): boolean => filter.kind !== "all" || filter.waitingOn !== "all" || filter.unresolvedOnly;

/** Short labels: the group's own heading already says "waiting on". */
const PARTIES: { value: WaitingParty; label: string }[] = [
  { value: "visitor", label: "Visitor" },
  { value: "expert", label: "Expert" },
  { value: "internal", label: "OIA" },
  { value: "och", label: "OCH" },
];

const toggle = "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const off = "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground";

/**
 * Three ways to cut a long log: what kind of thing happened, who we were waiting on, and
 * whether it is still open. Local state — the log is already on the page, so filtering it
 * costs no round trip and leaves the URL alone.
 */
export function ActivityFilters({ value, onChange, shown, total, className }: { value: ActivityFilter; onChange: (next: ActivityFilter) => void; shown: number; total: number; className?: string }) {
  const ids = useId();

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor={`${ids}-kind`} className="text-xs font-medium text-muted-foreground">
          Kind
        </label>
        <select id={`${ids}-kind`} value={value.kind} onChange={(event) => onChange({ ...value, kind: event.target.value as ActivityFilter["kind"] })} className={cn(selectClass, "h-7 w-auto text-xs")}>
          <option value="all">All kinds</option>
          {ACTIVITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {ACTIVITY_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Waiting on">
        {PARTIES.map((party) => {
          const pressed = value.waitingOn === party.value;
          return (
            <button
              key={party.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange({ ...value, waitingOn: pressed ? "all" : party.value })}
              className={cn(toggle, pressed ? "border-primary/50 bg-primary/10 text-foreground" : off)}
            >
              {party.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={value.unresolvedOnly}
        onClick={() => onChange({ ...value, unresolvedOnly: !value.unresolvedOnly })}
        className={cn(toggle, "inline-flex items-center gap-1.5", value.unresolvedOnly ? "border-age-warn/50 bg-age-warn/12 text-foreground" : off)}
      >
        <CircleDot className={cn("size-3", value.unresolvedOnly ? "text-age-warn" : "text-muted-foreground")} aria-hidden />
        Unresolved only
      </button>

      <p aria-live="polite" className="numeric ml-auto text-xs text-muted-foreground">
        {shown === total ? `${total} ${total === 1 ? "entry" : "entries"}` : `${shown} of ${total}`}
      </p>

      {isFiltered(value) ? (
        <button type="button" onClick={() => onChange(NO_FILTER)} className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <RotateCcw className="size-3" aria-hidden />
          Clear
        </button>
      ) : null}
    </div>
  );
}
