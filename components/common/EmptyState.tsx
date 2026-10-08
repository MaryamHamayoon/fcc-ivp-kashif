import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  as: Heading = "h2",
}: {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Heading level for `title`. Defaults to "h2" — a whole standalone page (e.g. not-found) should pass "h1". */
  as?: "h1" | "h2";
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed bg-card/60 px-6 py-14 text-center", className)}>
      {Icon ? (
        <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
