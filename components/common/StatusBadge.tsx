import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Tailwind needs literal class names, so the status → token map is spelled out. */
export const STATUS_DOT: Record<MeetingStatus, string> = {
  requested: "bg-status-requested",
  developing: "bg-status-developing",
  clearance: "bg-status-clearance",
  confirmed: "bg-status-confirmed",
  completed: "bg-status-completed",
  closed: "bg-status-closed",
  on_hold: "bg-status-on-hold",
  cancelled: "bg-status-cancelled",
};

export function StatusDot({ status, className }: { status: MeetingStatus; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

export function StatusBadge({ status, className }: { status: MeetingStatus; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-foreground", className)}>
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}
