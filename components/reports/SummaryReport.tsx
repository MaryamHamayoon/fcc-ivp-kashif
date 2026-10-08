"use client";

import { ChartFigure } from "@/components/charts/ChartFigure";
import { DualLine } from "@/components/charts/DualLine";
import { HorizontalBars } from "@/components/charts/HorizontalBars";
import { PairedBars } from "@/components/charts/PairedBars";
import { SplitBar } from "@/components/charts/SplitBar";
import { fyLabel } from "@/lib/domain/glance";
import type { Summary } from "@/lib/domain/reports";
import { FigureRow } from "./FigureRow";
import { ReportSection } from "./ReportSection";

const TOP = 8;

/** The year at a glance: four figures, then six views of the meetings that count. */
export function SummaryReport({ summary, fy, csvHref }: { summary: Summary; fy: number; csvHref: string }) {
  const current = fyLabel(fy);
  const prior = fyLabel(fy - 1);
  const noData = <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">No data yet for {current}.</p>;
  const cadenceEmpty = summary.cadence.every((d) => d.current === 0 && d.prior === 0);
  const categories = summary.participantsByCategory.filter((c) => c.planned > 0 || c.actual > 0);

  return (
    <ReportSection id="report-summary" title="Program summary" description={summary.headline} csvHref={csvHref}>
      <FigureRow figures={summary.figures} priorLabel={prior} />

      <div className="grid gap-5 xl:grid-cols-12">
        <ChartFigure
          title="Participants by category"
          description={`Participants planned and actually attending, by category, for meetings counted in ${current}.`}
          table={{ columns: ["Category", "Planned", "Actual"], rows: summary.participantsByCategory.map((c) => [c.label, c.planned, c.actual]) }}
          className="xl:col-span-6"
        >
          {categories.length === 0 ? noData : <PairedBars data={categories.map((c) => ({ key: c.category, label: c.label, planned: c.planned, actual: c.actual }))} label={`Participants by category in ${current}`} />}
        </ChartFigure>

        <ChartFigure title="Formats" description={`Share of ${current} meetings held in each format.`} table={{ columns: ["Format", "Meetings"], rows: summary.formats.map((d) => [d.label, d.count]) }} className="xl:col-span-6">
          {summary.formats.every((d) => d.count === 0) ? noData : <SplitBar data={summary.formats} label={`Meeting formats in ${current}`} />}
        </ChartFigure>

        <ChartFigure title="Topics" note={summary.topics.length > TOP ? `Top ${TOP} of ${summary.topics.length}` : undefined} description={`Topics discussed in ${current}, most to least.`} table={{ columns: ["Topic", "Meetings"], rows: summary.topics.map((d) => [d.label, d.count]) }} className="xl:col-span-4">
          {summary.topics.length === 0 ? noData : <HorizontalBars data={summary.topics.slice(0, TOP)} label={`Meetings by topic in ${current}`} />}
        </ChartFigure>

        <ChartFigure title="Regions" description={`Meetings held in ${current}, grouped by world region, most to least.`} table={{ columns: ["Region", "Meetings"], rows: summary.regions.map((d) => [d.label, d.count]) }} className="xl:col-span-4">
          {summary.regions.length === 0 ? noData : <HorizontalBars data={summary.regions} label={`Meetings by region in ${current}`} />}
        </ChartFigure>

        <ChartFigure title="Bureaus & offices" note={summary.bureaus.length > TOP ? `Top ${TOP} of ${summary.bureaus.length}` : undefined} description={`Bureaus and offices whose experts were engaged in ${current}.`} table={{ columns: ["Bureau", "Meetings"], rows: summary.bureaus.map((d) => [d.label, d.count]) }} className="xl:col-span-4">
          {summary.bureaus.length === 0 ? noData : <HorizontalBars data={summary.bureaus.slice(0, TOP)} label={`Meetings by bureau in ${current}`} color="var(--chart-3)" />}
        </ChartFigure>

        <ChartFigure title="Monthly cadence" description={`Meetings held each fiscal month, ${current} compared with ${prior}.`} table={{ columns: ["Month", current, prior], rows: summary.cadence.map((d) => [d.month, d.current, d.prior]) }} className="xl:col-span-12">
          {cadenceEmpty ? noData : <DualLine data={summary.cadence} currentLabel={current} priorLabel={prior} label={`Monthly meeting cadence, ${current} versus ${prior}`} />}
        </ChartFigure>
      </div>
    </ReportSection>
  );
}
