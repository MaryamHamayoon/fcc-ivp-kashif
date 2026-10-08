import { UserAvatar } from "@/components/common/Avatar";
import { type ExpertStatus, EXPERT_STATUS_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type ExpertChip = { id: string; name: string; status: ExpertStatus };

/** Green confirmed, amber still waiting, grey everything else — matched to the readiness rules. */
const DOT: Record<ExpertStatus, string> = {
  confirmed: "bg-ok",
  requested: "bg-warn",
  tbd: "bg-muted-foreground",
  declined: "bg-muted-foreground",
  withdrawn: "bg-muted-foreground",
};

/** Stacked initials for the briefers on a meeting; the full roster is the accessible name. */
export function ExpertAvatars({ experts, max = 4, className }: { experts: ExpertChip[]; max?: number; className?: string }) {
  if (experts.length === 0) return <span className={cn("text-xs text-muted-foreground", className)}>None yet</span>;

  const shown = experts.slice(0, max);
  const rest = experts.length - shown.length;
  const label = `Experts: ${experts.map((e) => `${e.name} (${EXPERT_STATUS_LABELS[e.status]})`).join(", ")}`;

  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex items-center", className)}>
      {shown.map((expert) => (
        <span key={expert.id} className="relative -ml-1.5 first:ml-0">
          <UserAvatar name={expert.name} size="xs" decorative className="ring-card" />
          <span aria-hidden className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card", DOT[expert.status])} />
        </span>
      ))}
      {rest > 0 ? <span aria-hidden className="ml-1.5 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">+{rest}</span> : null}
    </span>
  );
}
