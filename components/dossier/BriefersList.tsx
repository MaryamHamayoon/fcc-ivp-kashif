import Link from "next/link";
import { UserAvatar } from "@/components/common/Avatar";
import type { Briefer } from "@/lib/domain/dossier";
import { formatNumber } from "@/lib/format";

/** The FCC experts who have briefed this delegation, most asked first; each name opens the staff profile. */
export function BriefersList({ briefers }: { briefers: Briefer[] }) {
  if (briefers.length === 0) {
    return <p className="rounded-xl border border-dashed bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">No FCC expert has briefed them yet.</p>;
  }
  return (
    <ol aria-label="Briefers" className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
      {briefers.map((b) => (
        <li key={b.staffId} className="flex items-center gap-3 px-4 py-2.5">
          <UserAvatar name={b.name} size="sm" decorative />
          <span className="min-w-0 flex-1">
            <Link href={`/directory/staff/${b.staffId}`} className="block truncate text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {b.name}
            </Link>
            <span className="block truncate text-xs text-muted-foreground">{b.bureauName ?? b.bureauCode ?? "Bureau not on file"}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            <span className="numeric font-semibold text-foreground">{formatNumber(b.count)}</span> {b.count === 1 ? "briefing" : "briefings"}
          </span>
        </li>
      ))}
    </ol>
  );
}
