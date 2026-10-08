import { Check } from "lucide-react";
import type { Readiness } from "@/lib/domain/readiness";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

/**
 * The six checks behind the readiness ring, each saying what is still missing rather than
 * only that something is. Readiness is derived — nobody types it — so this list is the whole
 * explanation of the number in the header, and the shortest path to closing the gap.
 */
export function ReadinessChecklist({ readiness, className }: { readiness: Readiness; className?: string }) {
  const done = readiness.items.length - readiness.missing.length;

  return (
    <Panel
      id="readiness-heading"
      eyebrow="Readiness"
      title={readiness.isReady ? "Ready to run" : `${done} of ${readiness.items.length} in place`}
      action={<span className="numeric text-2xl leading-none font-medium text-foreground">{readiness.percent}%</span>}
      className={className}
    >
      <ul className="-mx-1 divide-y divide-border/60">
        {readiness.items.map((item) => (
          <li key={item.key} className="flex items-start gap-3 px-1 py-2.5 first:pt-0 last:pb-0">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                item.done ? "border-ok/40 bg-ok/12 text-ok" : "border-dashed border-border bg-transparent",
              )}
            >
              {item.done ? <Check className="size-3" /> : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {item.label}
                <span className="sr-only">{item.done ? " — done" : " — outstanding"}</span>
              </span>
              <span className={cn("block text-xs", item.done ? "text-muted-foreground" : "text-warn")}>{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
