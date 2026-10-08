import { CalendarRange, Landmark, Video } from "lucide-react";
import { ChartFigure } from "@/components/charts/ChartFigure";
import { DualLine } from "@/components/charts/DualLine";
import { FormatDonut } from "@/components/charts/FormatDonut";
import { HorizontalBars } from "@/components/charts/HorizontalBars";
import { TopicsFigure } from "@/components/dashboard/TopicsFigure";
import { fyLabel } from "@/lib/domain/glance";
import type { DashboardData } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";

const points = (delta: number | null) => (delta === null ? "—" : delta > 0 ? `+${delta}` : String(delta));

/**
 * The year in four figures. Regions are not repeated here: the map above already counts them.
 * Each figure names itself in its own title bar, so the section's heading is kept for screen
 * readers only, and no figure carries a strapline: the name and the picture say it.
 */
export function Analytics({ analytics, fy, className }: { analytics: DashboardData["analytics"]; fy: number; className?: string }) {
  const current = fyLabel(fy);
  const prior = fyLabel(fy - 1);
  const noData = <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">No data yet for {current}.</p>;
  const cadenceEmpty = analytics.cadence.length === 0 || analytics.cadence.every((d) => d.current === 0 && d.prior === 0);
  const { topics, formats } = analytics;
  const compared = formats.some((f) => f.priorShare !== null);

  return (
    // `relative` keeps the sr-only heading from inflating the page inside the scrolling column.
    <section aria-labelledby="analytics-heading" className={cn("relative grid gap-6 xl:grid-cols-12", className)}>
      <h2 id="analytics-heading" className="sr-only">
        {current} in figures
      </h2>
      <TopicsFigure flows={topics} current={current} className="xl:col-span-8" />

      <ChartFigure
        title="Formats"
        icon={<Video />}
        description={`Share of ${current} meetings held in person, virtually and in hybrid form${compared ? `, with the change in share since ${prior}` : ""}.`}
        table={{
          columns: ["Format", "Meetings", "Participants", `Share of ${current}`, ...(compared ? [`Change since ${prior} (points)`] : [])],
          rows: formats.map((f) => [f.label, f.count, f.participants, `${Math.round(f.share * 100)}%`, ...(compared ? [points(f.deltaPoints)] : [])]),
        }}
        className="xl:col-span-4"
      >
        {formats.length === 0 ? noData : <FormatDonut data={formats} label={`Meeting formats in ${current}`} currentLabel={current} priorLabel={prior} />}
      </ChartFigure>

      <ChartFigure
        title="Cadence"
        icon={<CalendarRange />}
        description={`Meetings held each fiscal month, ${current} compared with ${prior}.`}
        table={{ columns: ["Month", current, prior], rows: analytics.cadence.map((d) => [d.month, d.current, d.prior]) }}
        className="xl:col-span-8"
      >
        {cadenceEmpty ? noData : <DualLine data={analytics.cadence} currentLabel={current} priorLabel={prior} label={`Monthly meeting cadence, ${current} versus ${prior}`} />}
      </ChartFigure>

      <ChartFigure
        title="Bureaus & offices"
        icon={<Landmark />}
        description={`Bureaus and offices with confirmed experts engaged in ${current}.`}
        table={{ columns: ["Bureau", "Meetings"], rows: analytics.bureaus.map((d) => [d.label, d.count]) }}
        className="xl:col-span-4"
      >
        {analytics.bureaus.length === 0 ? noData : <HorizontalBars data={analytics.bureaus} label={`Meetings by bureau in ${current}`} color="var(--chart-3)" />}
      </ChartFigure>
    </section>
  );
}
