import { Download, FolderOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Flag } from "@/components/common/Flag";
import { buttonVariants } from "@/components/ui/button";
import type { DossierFigures } from "@/lib/domain/dossier";
import { fyLabel } from "@/lib/domain/glance";
import { STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatNumber } from "@/lib/format";

export type DossierHeroProps = {
  flagCode: string | null;
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  figures: DossierFigures;
  /** The library filtered to this subject. */
  materialsHref: string;
  /** The history workbook; null when this reader may not export reports. */
  exportHref: string | null;
};

/**
 * A dossier's opening: who this is, the five figures that say how the relationship stands,
 * and the two things a coordinator comes here to do — open the materials, export the history.
 */
export function DossierHero({ flagCode, eyebrow, title, subtitle, figures, materialsHref, exportHref }: DossierHeroProps) {
  const next = figures.next;
  return (
    <section aria-labelledby="dossier-heading" className="surface overflow-hidden p-6 sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between md:gap-8">
        <div className="flex min-w-0 items-start gap-4">
          {flagCode ? <Flag code={flagCode} size={48} className="mt-1 shrink-0 rounded-md shadow-soft" /> : null}
          <div className="min-w-0">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="dossier-heading" className="heading-display mt-1 text-[1.75rem] leading-tight text-balance md:text-[2rem]">
              {title}
            </h1>
            {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href={materialsHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FolderOpen className="size-3.5" aria-hidden />
            All materials
          </Link>
          {exportHref ? (
            <a href={exportHref} download className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="size-3.5" aria-hidden />
              Export history
            </a>
          ) : null}
        </div>
      </div>

      <dl aria-label="Engagement figures" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border bg-border sm:grid-cols-3 lg:grid-cols-5">
        <Figure label="Engagements">
          {formatNumber(figures.engagements)}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {formatNumber(figures.engagementsFy)} in {fyLabel(figures.fy)}
          </span>
        </Figure>
        <Figure label="Participants">{formatNumber(figures.participants)}</Figure>
        <Figure label="First engaged">{figures.firstAt ? formatDateNY(figures.firstAt, "short") : "—"}</Figure>
        <Figure label="Last engaged">{figures.lastAt ? formatDateNY(figures.lastAt, "short") : "—"}</Figure>
        <Figure label="Next meeting">
          {next ? (
            <Link href={`/meetings/${next.id}`} className="underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {formatDateNY(next.start, "short")}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{STATUS_LABELS[next.status]}</span>
            </Link>
          ) : (
            <span className="text-base font-normal text-muted-foreground">None scheduled</span>
          )}
        </Figure>
      </dl>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="numeric mt-1 text-xl leading-tight font-semibold text-foreground">{children}</dd>
    </div>
  );
}
