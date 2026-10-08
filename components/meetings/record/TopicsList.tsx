import { EmptyState } from "@/components/common/EmptyState";
import { MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

export type RecordTopic = {
  id: string;
  rank: number;
  /** What the delegation actually asked about this topic, in their words. */
  detail: string | null;
  topic: { id: string; name: string };
};

/**
 * The delegation's agenda in their own priority order, with the question they sent under each
 * heading. Briefers read this before anything else, so the question is quoted rather than
 * paraphrased — it is the only place their voice survives into the record.
 */
export function TopicsList({ topics, className }: { topics: RecordTopic[]; className?: string }) {
  const ranked = [...topics].sort((a, b) => a.rank - b.rank);

  return (
    <Panel id="topics-heading" eyebrow="What they asked for" title={`Topics (${ranked.length})`} className={className}>
      {ranked.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No topics yet" description="Add the topics the delegation wants to cover so briefers can be sourced against them." className="py-8" />
      ) : (
        <ol className="space-y-3">
          {ranked.map((entry, index) => (
            <li key={entry.id} className="flex gap-3">
              <span aria-hidden className="numeric mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{entry.topic.name}</span>
                {entry.detail ? <span className={cn("mt-1 block border-l-2 border-brand/40 pl-3 text-sm leading-relaxed text-muted-foreground italic")}>“{entry.detail}”</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
