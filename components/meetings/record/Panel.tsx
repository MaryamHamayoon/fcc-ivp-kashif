import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The record's one card. Every block on the record — overview sections and rail cards alike —
 * is this shape, so the page reads as a single document rather than a tray of unrelated tiles.
 * Hierarchy comes from the heading and the whitespace, never from a different border or shadow.
 */
export function Panel({
  id,
  eyebrow,
  title,
  action,
  children,
  className,
  dense = false,
}: {
  /** Id of the heading; the section is labelled by it. */
  id: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  /** A link or control that belongs to this section, aligned with the heading. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Rail-sized: smaller heading and padding. */
  dense?: boolean;
}) {
  return (
    <section aria-labelledby={id} className={cn("min-w-0 rounded-3xl border bg-card shadow-soft", dense ? "p-4" : "p-5", className)}>
      <header className={cn("flex items-start justify-between gap-3", dense ? "mb-3" : "mb-4")}>
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          {dense ? (
            <h2 id={id} className="text-sm font-semibold tracking-wide">
              {title}
            </h2>
          ) : (
            <h2 id={id} className="heading-display mt-1 text-xl leading-none">
              {title}
            </h2>
          )}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A label/value pair; the label is the term, so screen readers hear the pairing. */
export function Fact({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}
