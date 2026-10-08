import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The page's own title block, under the top bar. The bar carries no title — it is the same on
 * every screen — so this is where the eye lands first: a compact title, named as the rail names
 * the page, with its actions on the same line. No tagline: the page explains itself. The one
 * line `description` still allows is data — the dashboard's date, a person's job title.
 */
export function PageHeader({ eyebrow, title, description, actions, className, children }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <header className={cn("flex flex-col", className)}>
      {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
        <h1 className="heading-display min-w-0 text-[1.25rem] leading-tight text-balance md:text-[1.375rem]">{title}</h1>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>
      {description ? <p className="mt-0.5 max-w-2xl text-[0.8125rem] text-muted-foreground">{description}</p> : null}
      {children}
    </header>
  );
}
