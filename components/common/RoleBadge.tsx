import { ROLE_LABELS } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type RoleKey = keyof typeof ROLE_LABELS;

/**
 * One tint per role, all drawn from the app's own palette — gold means FCC (the seal, the map's arcs,
 * the OCH star) and navy is the seal's own blue, so neither is a role color. The administrator
 * is the only solid fill: the one role that outranks the rest reads as filled, not tinted.
 */
export const ROLE_TONE: Record<RoleKey, string> = {
  admin: "bg-brand text-primary-foreground",
  coordinator: "bg-primary/10 text-primary",
  regional_lead: "bg-status-clearance/12 text-status-clearance",
  expert: "bg-status-confirmed/12 text-status-confirmed",
  executive: "bg-status-on-hold/12 text-status-on-hold",
  viewer: "bg-muted text-muted-foreground",
};

export function RoleBadge({ role, className }: { role: RoleKey; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-wider", ROLE_TONE[role], className)}>
      {ROLE_LABELS[role]}
    </span>
  );
}
