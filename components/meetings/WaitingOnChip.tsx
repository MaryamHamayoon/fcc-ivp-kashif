import { WAITING_ON_LABELS } from "@/lib/domain/types";
import type { AgeBand, WaitingState } from "@/lib/domain/waiting-on";
import { formatDateNY } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAND: Record<AgeBand, { chip: string; dot: string }> = {
  ok: { chip: "bg-age-ok/12 ring-age-ok/30", dot: "bg-age-ok" },
  warn: { chip: "bg-age-warn/15 ring-age-warn/35", dot: "bg-age-warn" },
  alert: { chip: "bg-age-alert/15 ring-age-alert/35", dot: "bg-age-alert" },
};

/** "ARTCI POC · 16d" — who owes us the next move, and for how many working days. */
export function WaitingOnChip({ waiting, className }: { waiting: WaitingState; className?: string }) {
  if (!waiting) return null;
  const band = BAND[waiting.band];
  const days = `${waiting.businessDays}d`;
  const title = `Waiting on ${WAITING_ON_LABELS[waiting.who]} — ${waiting.businessDays} business ${waiting.businessDays === 1 ? "day" : "days"} since ${formatDateNY(waiting.since, "short")}${waiting.nextAction ? ` · Next: ${waiting.nextAction}` : ""}`;

  return (
    <span title={title} className={cn("inline-flex max-w-52 shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-foreground ring-1 ring-inset", band.chip, className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", band.dot)} />
      <span className="truncate">{`${waiting.label} · ${days}`}</span>
    </span>
  );
}
