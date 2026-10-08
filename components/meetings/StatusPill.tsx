import { StatusDot } from "@/components/common/StatusBadge";
import { type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/**
 * The list's status chip: a wash of the status colour behind foreground text, so the
 * colour reads at a glance without ever being the only signal — and without dropping
 * below 4.5:1 the way white-on-amber would.
 */
const TONE: Record<MeetingStatus, string> = {
  requested: "bg-status-requested/12 ring-status-requested/30",
  developing: "bg-status-developing/12 ring-status-developing/30",
  clearance: "bg-status-clearance/12 ring-status-clearance/30",
  confirmed: "bg-status-confirmed/12 ring-status-confirmed/30",
  completed: "bg-status-completed/12 ring-status-completed/30",
  closed: "bg-status-closed/12 ring-status-closed/30",
  on_hold: "bg-status-on-hold/12 ring-status-on-hold/30",
  cancelled: "bg-status-cancelled/12 ring-status-cancelled/30",
};

export function StatusPill({ status, className }: { status: MeetingStatus; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground ring-1 ring-inset", TONE[status], className)}>
      <StatusDot status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}
