import Link from "next/link";
import { DateText } from "@/components/common/DateText";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { EngagementHistoryItem } from "@/lib/services/directory";

/** Reverse-chronological list of meetings, with a status pill and a link to the meeting record. Shared by expert, organization and country profiles. */
export function MeetingHistoryList({ items, emptyMessage = "No meetings recorded yet." }: { items: EngagementHistoryItem[]; emptyMessage?: string }) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-dashed bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <ol className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
      {items.map((m) => (
        <li key={m.id}>
          <Link
            href={`/meetings/${m.id}`}
            className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{m.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {m.code}
                {m.subtitle ? ` · ${m.subtitle}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <DateText date={m.scheduledStart} fallback="Undated" className="text-xs text-muted-foreground" />
              <StatusBadge status={m.status} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
