import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionBarProps = {
  title: string;
  /** The id on the title, for the section's `aria-labelledby`. */
  titleId?: string;
  /** Where the title sits in the page's outline. */
  level?: 2 | 3;
  /** The bar's own element: a figure's caption has to be a `figcaption`. */
  as?: "header" | "figcaption";
  /** The surface the bar sits on: a white card, or the dark program band, whose ink it then wears. */
  tone?: "card" | "band";
  /**
   * The section's icon, already drawn: `icon={<Globe />}`. An element rather than a component,
   * because a server page can hand an element to a client figure and cannot hand it a function.
   */
  icon?: ReactNode;
  iconClassName?: string;
  /** A tally beside the name. */
  count?: number;
  /** What the tally counts, for a reader who cannot see where it sits: "open items". */
  countLabel?: string;
  /** A short fact beside the name — "11 countries", "Top 8 of 23". Never a description. */
  note?: ReactNode;
  /** The section's filters and controls, set to the right. */
  children?: ReactNode;
  className?: string;
};

const TONES = {
  card: { bar: "bg-muted/40", title: "text-foreground", quiet: "text-muted-foreground", count: "bg-card text-muted-foreground" },
  band: { bar: "border-band-border bg-white/[0.05]", title: "text-band-foreground", quiet: "text-band-muted", count: "border-band-border bg-band-surface text-band-muted" },
} as const;

/**
 * The slim title bar every dashboard section and every chart opens with: the section's name on
 * the left — an icon, the name, a tally or a short fact where there is one — and whatever
 * filters and controls the section has on the right. One row, the height of a toolbar row; on a
 * phone the controls drop to a second line rather than squeeze the name.
 */
export function SectionBar({ title, titleId, level = 2, as: Bar = "header", tone = "card", icon, iconClassName, count, countLabel, note, children, className }: SectionBarProps) {
  const Title = level === 2 ? "h2" : "h3";
  const ink = TONES[tone];
  return (
    <Bar data-slot="section-bar" data-tone={tone} className={cn("flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b py-1.5 pr-2.5 pl-5", ink.bar, className)}>
      <div className="flex min-w-0 items-center gap-2 py-0.5">
        {icon ? (
          <span aria-hidden className={cn("flex shrink-0 [&>svg]:size-4", ink.quiet, iconClassName)}>
            {icon}
          </span>
        ) : null}
        <Title id={titleId} className={cn("heading-display truncate text-sm leading-5", ink.title)}>
          {title}
        </Title>
        {count === undefined ? null : (
          <span className={cn("numeric shrink-0 rounded-sm border px-1.5 text-[0.6875rem] leading-[1.125rem] font-medium", ink.count)}>
            {count}
            {countLabel ? <span className="sr-only"> {countLabel}</span> : null}
          </span>
        )}
        {note ? (
          <span data-slot="section-note" className={cn("shrink-0 text-xs", ink.quiet)}>
            {note}
          </span>
        ) : null}
      </div>
      {children ? <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">{children}</div> : null}
    </Bar>
  );
}
