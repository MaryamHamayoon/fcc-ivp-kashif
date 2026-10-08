import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled block of a dossier; the heading names the section for the page's outline and for assistive tech. */
export function DossierSection({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`${id}-heading`} className={cn("min-w-0", className)}>
      <h2 id={`${id}-heading`} className="mb-3 text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
