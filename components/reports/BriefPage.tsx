import { ArrowLeft, Download } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PairedBars } from "@/components/charts/PairedBars";
import { SplitBar } from "@/components/charts/SplitBar";
import { Delta } from "@/components/dashboard/Delta";
import { buttonVariants } from "@/components/ui/button";
import type { NamedCount } from "@/lib/domain/tallies";
import { FORMAT_LABELS, type MeetingFormat, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatNumber } from "@/lib/format";
import type { Brief } from "@/lib/reports/brief-data";
import { briefPdfHref } from "@/lib/reports/href";

/**
 * The executive brief on screen: the same one page the PDF prints, laid out as a sheet of
 * paper so a director reads it in a minute and a coordinator checks it before sending. The
 * action row above the sheet never prints.
 */

function Section({ title, unit, children }: { title: string; unit?: string; children: ReactNode }) {
  const id = `brief-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={id}>
      <div className="flex items-baseline justify-between border-b pb-1.5">
        <h2 id={id} className="eyebrow">
          {title}
        </h2>
        {unit ? <span className="text-[0.625rem] tracking-[0.08em] text-muted-foreground uppercase">{unit}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Ranked({ rows, label }: { rows: NamedCount[]; label: string }) {
  if (rows.length === 0) return <p className="py-2 text-sm text-muted-foreground">Nothing counted yet.</p>;
  return (
    <ol aria-label={label} className="divide-y">
      {rows.map((row) => (
        <li key={row.key} className="flex items-baseline gap-3 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <span className="numeric font-semibold">{formatNumber(row.count)}</span>
        </li>
      ))}
    </ol>
  );
}

export function BriefPage({ brief }: { brief: Brief }) {
  const generated = formatDateNY(brief.generatedAt, "long");
  const formats = brief.formats.map((f) => ({ ...f, label: f.key in FORMAT_LABELS ? FORMAT_LABELS[f.key as MeetingFormat] : f.label }));

  return (
    <div className="mx-auto max-w-[52rem]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/reports?fy=${brief.fy}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to reports
        </Link>
        <a href={briefPdfHref(brief.fy)} className={buttonVariants({ size: "sm" })}>
          <Download className="size-4" aria-hidden />
          Download PDF
        </a>
      </div>

      <article data-brief aria-labelledby="brief-title" className="surface px-7 py-8 sm:px-12 sm:py-11">
        <header className="flex items-start gap-4">
          <Image src="/brand/fcc-seal.svg" alt="" width={44} height={44} className="size-11 shrink-0" />
          <div className="min-w-0">
            <p className="eyebrow">International Visitors Program</p>
            <h1 id="brief-title" className="heading-display mt-0.5 text-2xl">
              {brief.fyLabel} executive brief
            </h1>
          </div>
          <p className="ml-auto shrink-0 text-right text-xs leading-5 text-muted-foreground">
            {generated}
            <br />
            Office of International Affairs
          </p>
        </header>
        <hr className="my-5 border-0 border-t-2 border-primary" />
        <p className="max-w-[40rem] text-lg leading-snug font-semibold text-balance">{brief.headline}</p>

        <ul aria-label="Key figures" className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border bg-border sm:grid-cols-4">
          {brief.figures.map((figure) => (
            <li key={figure.id} className="bg-card p-4">
              <p className="numeric text-2xl leading-none font-bold text-primary">{formatNumber(figure.value)}</p>
              <p className="mt-1.5 text-sm font-semibold">{figure.label}</p>
              {figure.prior === null ? <p className="mt-1.5 text-xs text-muted-foreground">no {brief.priorLabel} data</p> : <Delta value={figure.value} prior={figure.prior} priorLabel={brief.priorLabel} tone="card" className="mt-1.5" />}
              <p className="mt-1.5 text-[0.6875rem] leading-snug text-muted-foreground">{figure.note}</p>
            </li>
          ))}
        </ul>

        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          <Section title="Where" unit="Meetings">
            <Ranked rows={brief.where.countries} label="Countries by meetings" />
            <p className="mt-4 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Regions</p>
            <Ranked rows={brief.where.regions} label="Regions by meetings" />
          </Section>
          <Section title="What" unit="Meetings">
            <Ranked rows={brief.what} label="Topics by meetings" />
          </Section>

          <Section title="Next 30 days">
            {brief.next.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nothing scheduled in the next thirty days.</p>
            ) : (
              <ol aria-label="Meetings in the next thirty days" className="divide-y">
                {brief.next.map((m) => (
                  <li key={m.meetingId} className="flex items-baseline gap-3 py-1.5 text-sm">
                    <span className="numeric w-20 shrink-0 font-semibold">{formatDateNY(m.date, "weekday")}</span>
                    <Link href={`/meetings/${m.meetingId}`} className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">
                      {m.countryName} · {m.orgName}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABELS[m.status]}</span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <Section title="Needs attention" unit="Waiting on">
            {brief.stuck.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Nothing is waiting on anyone.</p>
            ) : (
              <ol aria-label="Meetings waiting longest" className="divide-y">
                {brief.stuck.map((m) => (
                  <li key={m.meetingId} className="flex items-baseline gap-3 py-1.5 text-sm">
                    <Link href={`/meetings/${m.meetingId}`} className="numeric shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline">
                      {m.code}
                    </Link>
                    <span className="min-w-0 flex-1 truncate">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {m.who} · {m.days}d
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Participants" unit="Planned / actual">
            {brief.participants.length === 0 ? <p className="py-2 text-sm text-muted-foreground">No participants recorded yet.</p> : <PairedBars data={brief.participants.map((c) => ({ key: c.category, label: c.label, planned: c.planned, actual: c.actual }))} label="Participants by category, planned against actual" className="mt-3" />}
          </Section>
          <Section title="Format">
            {formats.length === 0 ? <p className="py-2 text-sm text-muted-foreground">No meetings counted yet.</p> : <SplitBar data={formats} label="Meetings by format" className="mt-3" />}
          </Section>
        </div>

        <footer className="mt-9 flex flex-wrap justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>Prepared by the IVP platform for the Office of International Affairs</span>
          <span>{generated}</span>
        </footer>
      </article>
    </div>
  );
}
