"use client";

import { Tags } from "lucide-react";
import { useState } from "react";
import { ChartFigure } from "@/components/charts/ChartFigure";
import { TopicFlow } from "@/components/charts/TopicFlow";
import { RegionSelect } from "@/components/common/RegionSelect";
import { regionTopicFlows, type TopicFlows } from "@/lib/domain/insights";

/** Rows the drilled column draws; the same number the chart itself folds at. */
const MAX_COUNTRIES = 8;

/**
 * The Topics figure, which is the one figure on the dashboard with a level under it: the year's
 * leading topics against the regions that raised them, and — through the `Region` menu in its
 * title bar or a press on a region in the chart — against one region's countries. The drill is
 * held here so the chart, the menu, the description and the data table all say the same thing.
 */
export function TopicsFigure({ flows, current, className }: { flows: TopicFlows; current: string; className?: string }) {
  const [region, setRegion] = useState<string | null>(null);
  const drill = region ? regionTopicFlows(flows, region, MAX_COUNTRIES) : null;
  // A region the year's meetings never raised is no region at all; the figure stays on the overview.
  const opened = drill?.region ?? null;

  const raisedMostBy = (topic: string) => {
    const [lead] = flows.links.filter((l) => l.topic === topic).sort((a, b) => b.count - a.count);
    return lead ? `${lead.region} (${lead.count})` : "—";
  };
  const raisedMostIn = (topic: string) => {
    const [lead] = (drill?.links ?? []).filter((l) => l.topic === topic).sort((a, b) => b.count - a.count);
    if (!lead) return "—";
    return `${drill?.countries.find((c) => c.key === lead.country)?.label ?? lead.country} (${lead.count})`;
  };

  return (
    <ChartFigure
      title="Topics"
      icon={<Tags />}
      actions={
        <RegionSelect
          allLabel="All regions"
          regions={flows.regions.map((r) => ({ name: r.label, count: r.meetings }))}
          value={opened}
          onChange={setRegion}
          align="end"
        />
      }
      description={
        drill
          ? `The topics ${drill.region}'s delegations took up in ${current}, each traced back to the countries that raised it. A ribbon is as thick as the meetings it carries.`
          : `The ${flows.topics.length} topics taken up most in ${current} meetings, each traced back to the regions whose delegations raised it. A ribbon is as thick as the meetings it carries.`
      }
      table={{
        columns: ["Topic", "Meetings", "Raised most by"],
        rows: drill ? drill.topics.map((t) => [t.label, t.meetings, raisedMostIn(t.key)]) : flows.topics.map((t) => [t.label, t.meetings, raisedMostBy(t.key)]),
      }}
      className={className}
    >
      {flows.topics.length === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">No data yet for {current}.</p>
      ) : (
        <TopicFlow
          flows={flows}
          region={opened}
          onRegion={setRegion}
          label={drill ? `Topics raised in ${current} by ${drill.region}, by country` : `Topics raised in ${current}, by region`}
        />
      )}
    </ChartFigure>
  );
}
