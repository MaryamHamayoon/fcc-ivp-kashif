"use client";

import { Star } from "lucide-react";
import type { NamedCount } from "@/lib/domain/tallies";
import { formatNumber } from "@/lib/format";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";

/**
 * The materials coordinators starred for reuse, by topic: one hairline row under the toolbar,
 * shown only while the Reuse-ready shelf is open. A chip narrows that shelf to one topic;
 * pressing it again lets the topic go and keeps the shelf.
 */
export function ReuseStrip({ topics, total, params, setFilter }: { topics: NamedCount[]; total: number; params: URLSearchParams; setFilter: (patch: ParamPatch) => void }) {
  if (total === 0 || topics.length === 0) return null;
  const activeTopic = params.get("reusable") === "true" ? params.get("topicId") : null;

  return (
    <section aria-label="Reuse-ready materials" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-2 shadow-soft">
      <p className="flex items-center gap-2 text-[0.8125rem]">
        <Star aria-hidden className="size-3.5 fill-primary text-primary" />
        <span className="font-medium">Reuse-ready</span>
        <span className="numeric font-semibold">{formatNumber(total)}</span>
      </p>
      <span aria-hidden className="hidden h-4 w-px bg-border sm:block" />
      <ul aria-label="By topic" className="flex flex-wrap items-center gap-1.5">
        {topics.map((topic) => {
          const active = activeTopic === topic.key;
          return (
            <li key={topic.key}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(active ? { topicId: null } : { reusable: "true", topicId: topic.key })}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[0.6875rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary/40 bg-accent text-accent-foreground" : "bg-background text-foreground hover:border-input hover:bg-muted",
                )}
              >
                {topic.label}
                <span className={cn("numeric", active ? "text-accent-foreground/70" : "text-muted-foreground")}>{topic.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
