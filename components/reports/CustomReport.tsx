"use client";

import { ChartFigure } from "@/components/charts/ChartFigure";
import { HorizontalBars } from "@/components/charts/HorizontalBars";
import { type FilterOption, SelectFilter } from "@/components/common/SelectFilter";
import { fyLabel } from "@/lib/domain/glance";
import { CUSTOM_MEASURE_LABELS, CUSTOM_MEASURES, CUSTOM_ROW_LABELS, CUSTOM_ROWS, type CustomMeasure, type CustomRows } from "@/lib/domain/reports";
import type { NamedCount } from "@/lib/domain/tallies";
import { customTable } from "@/lib/reports/tables";
import type { ParamPatch } from "@/lib/url-state";
import { ReportSection } from "./ReportSection";
import { ReportTable } from "./ReportTable";

const DEFAULT_ROWS: CustomRows = "topic";
const DEFAULT_MEASURE: CustomMeasure = "meetings";
const TOP = 12;

/** The default is the "all" choice of each select, so clearing a select is the same as choosing it. */
const ROW_OPTIONS: FilterOption[] = CUSTOM_ROWS.filter((r) => r !== DEFAULT_ROWS).map((r) => ({ value: r, label: CUSTOM_ROW_LABELS[r] }));
const MEASURE_OPTIONS: FilterOption[] = CUSTOM_MEASURES.filter((m) => m !== DEFAULT_MEASURE).map((m) => ({ value: m, label: CUSTOM_MEASURE_LABELS[m] }));

export type CustomChoice = { rows: CustomRows; measure: CustomMeasure; data: NamedCount[] };

/** Any rows against any measure; the URL holds the choice, so a custom report is a link someone can send. */
export function CustomReport({ custom, fy, params, setFilter, csvHref }: { custom: CustomChoice; fy: number; params: URLSearchParams; setFilter: (patch: ParamPatch) => void; csvHref: string }) {
  const current = fyLabel(fy);
  const table = customTable(custom.rows, custom.measure, custom.data);
  const rowLabel = CUSTOM_ROW_LABELS[custom.rows];
  const measureLabel = CUSTOM_MEASURE_LABELS[custom.measure];

  return (
    <ReportSection id="report-custom" title="Custom" description={`Pick what the rows are and what to count; the figures follow the filters above, for meetings counted in ${current}.`} csvHref={csvHref}>
      <div className="flex flex-wrap items-center gap-2">
        <SelectFilter label="Rows" param="rows" allLabel={CUSTOM_ROW_LABELS[DEFAULT_ROWS]} options={ROW_OPTIONS} params={params} setFilter={setFilter} />
        <SelectFilter label="Measure" param="measure" allLabel={CUSTOM_MEASURE_LABELS[DEFAULT_MEASURE]} options={MEASURE_OPTIONS} params={params} setFilter={setFilter} />
      </div>

      <div className="grid gap-5 xl:grid-cols-12">
        <ChartFigure
          title={`${measureLabel} by ${rowLabel.toLowerCase()}`}
          note={custom.data.length > TOP ? `Top ${TOP} of ${custom.data.length}` : `${custom.data.length} ${custom.data.length === 1 ? "row" : "rows"}`}
          description={`${measureLabel} for each ${rowLabel.toLowerCase()} in ${current}, most to least.`}
          table={{ columns: table.columns, rows: table.rows.map((row) => row.map((cell) => cell ?? "")) }}
          className="xl:col-span-5 self-start"
        >
          {custom.data.every((d) => d.count === 0) ? (
            <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">Nothing to count for {current}.</p>
          ) : (
            <HorizontalBars data={custom.data.slice(0, TOP)} label={`${measureLabel} by ${rowLabel.toLowerCase()} in ${current}`} />
          )}
        </ChartFigure>
        <ReportTable table={table} caption={`${measureLabel} by ${rowLabel.toLowerCase()} in ${current}`} scroll className="xl:col-span-7" />
      </div>
    </ReportSection>
  );
}
