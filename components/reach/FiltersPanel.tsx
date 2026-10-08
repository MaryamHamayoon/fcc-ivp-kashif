"use client";

import { ListFilter } from "lucide-react";
import { type ReactNode, useId, useMemo, useRef } from "react";
import { RegionSelect } from "@/components/common/RegionSelect";
import { SectionBar } from "@/components/common/SectionBar";
import { type FilterOption, SelectFilter } from "@/components/common/SelectFilter";
import { StatusDot } from "@/components/common/StatusBadge";
import { FormatGlyph } from "@/components/geo/FormatGlyph";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { facetCounts, figures, FORMAT_ORDER, isFiltered, type NamedTally, type ReachBureau, type ReachFigures, type ReachFilters, type ReachMeeting } from "@/lib/domain/reach";
import type { Span } from "@/lib/domain/reach-time";
import { FORMAT_LABELS, MEETING_STATUSES, STATUS_LABELS } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import type { ParamPatch } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import { DrawerClose } from "./SidePanel";

export type FiltersPanelProps = {
  /** The id for the panel's h2, "Filters", which the screen's aside is labelled by. */
  titleId: string;
  /** Every meeting the reader may see: the facets count these under the other filters. */
  meetings: readonly ReachMeeting[];
  /** The window in force. */
  window: Span;
  /** The meetings in the window through every filter: the four figures count these. */
  list: readonly ReachMeeting[];
  filters: ReachFilters;
  /** Code → full name, for the Bureau or office menu. */
  bureaus: readonly ReachBureau[];
  onChange: (filters: ReachFilters) => void;
  /** Clears every filter; the screen also returns the camera to the whole world. */
  onReset: () => void;
};

const FIGURES: readonly { key: keyof ReachFigures; label: string }[] = [
  { key: "meetings", label: "Meetings" },
  { key: "countries", label: "Countries" },
  { key: "participants", label: "Participants" },
  { key: "waiting", label: "Waiting" },
];

const LEGEND = "px-4 pt-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground";
const ROW = "h-7 cursor-pointer px-4 text-[0.8125rem] transition-colors select-none hover:bg-muted/60";
const RING = "focus-visible:ring-2 focus-visible:ring-ring";

/** A group's choices after one row is checked or unchecked, in the order the group reads. */
const toggled = <T extends string>(order: readonly T[], chosen: readonly T[], value: T, on: boolean): T[] => order.filter((v) => (v === value ? on : chosen.includes(v)));

/** A menu's tallies, busiest first; a chosen key the other filters have emptied stays, at 0, so it can be seen and undone. */
const withChosen = (tallies: readonly NamedTally[], chosen: string | null): readonly NamedTally[] =>
  chosen === null || tallies.some((t) => t.key === chosen) ? tallies : [...tallies, { key: chosen, count: 0 }];

/**
 * One choice in a facet group, and the whole row is its label: the checkbox, the status dot or
 * format glyph, the name, a bar as long as the count against the group's busiest row, and the
 * count. The checkbox is named by the name alone and described by the count. In a group narrower
 * than 16rem, which Extra large text makes of the 296 px panel, the bar's track is shorter, so the
 * names stay whole; every row has the same tracks, so the bars still line up.
 */
function FacetRow({ name, mark, count, max, checked, onCheckedChange }: { name: string; mark: ReactNode; count: number; max: number; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <label className={cn(ROW, "grid grid-cols-[auto_0.75rem_minmax(0,1fr)_3.5rem_2.25rem] items-center gap-x-2 @max-3xs:grid-cols-[auto_0.75rem_minmax(0,1fr)_2rem_2.25rem]")}>
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={`${id}-name`} aria-describedby={`${id}-count`} className={RING} />
      <span className="flex justify-center">{mark}</span>
      <span id={`${id}-name`} className="truncate">
        {name}
      </span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full origin-left bg-primary/70 transition-transform duration-300 ease-out" style={{ transform: `scaleX(${max > 0 ? count / max : 0})` }} />
      </span>
      <span id={`${id}-count`} className="numeric text-right text-xs">
        {/* The space sits outside the hidden word: a computed description trims each piece ("2meetings"). */}
        {formatNumber(count)} <span className="sr-only">{count === 1 ? "meeting" : "meetings"}</span>
      </span>
    </label>
  );
}

/**
 * A searchable menu whose choice is React state rather than a URL parameter, adapted the way
 * RegionSelect adapts SelectFilter: it is handed a parameter of its own, and the answer comes back
 * as a call. Null is the "All …" row.
 */
function FacetSelect({ label, allLabel, options, value, onChange }: { label: string; allLabel: string; options: FilterOption[]; value: string | null; onChange: (value: string | null) => void }) {
  const params = useMemo(() => new URLSearchParams(value === null ? {} : { value }), [value]);
  const setFilter = (patch: ParamPatch) => onChange(typeof patch.value === "string" ? patch.value : null);
  return <SelectFilter searchable label={label} param="value" allLabel={allLabel} options={options} params={params} setFilter={setFilter} />;
}

/** A switch named by the words beside it; the whole row is its label. */
function SwitchRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <label className={cn(ROW, "flex items-center justify-between gap-3")}>
      <span id={id}>{label}</span>
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} aria-labelledby={id} className={RING} />
    </label>
  );
}

/**
 * The full screen's Filters panel: four figures for what the reader is looking at, which stay in
 * view, then what narrows it, which scrolls. Every status, format, region, bureau and topic is
 * counted under every filter but its own group's, so each choice says what it would give; two
 * switches narrow to meetings the Chairman's office attends, or to high priority ones. Reset sits
 * in the title bar while anything is set.
 */
export function FiltersPanel({ titleId, meetings, window: span, list, filters, bureaus, onChange, onReset }: FiltersPanelProps) {
  const body = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => facetCounts(meetings, filters, span), [meetings, filters, span]);
  const shown = useMemo(() => figures(list), [list]);
  const statusMax = Math.max(...MEETING_STATUSES.map((status) => counts.status[status]));
  const formatMax = Math.max(...FORMAT_ORDER.map((format) => counts.format[format]));
  const set = (patch: Partial<ReachFilters>) => onChange({ ...filters, ...patch });

  function reset() {
    // Reset takes itself away, which would drop focus onto the page, so focus moves on to the first
    // filter; before onReset, so the screen can still send it somewhere else.
    body.current?.querySelector<HTMLElement>('[role="checkbox"]')?.focus();
    onReset();
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionBar title="Filters" titleId={titleId} icon={<ListFilter />} className="pl-4">
        {isFiltered(filters) ? (
          <button type="button" onClick={reset} className={cn("rounded-sm px-1.5 py-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none", RING)}>
            Reset
          </button>
        ) : null}
        <DrawerClose />
      </SectionBar>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b px-4 py-3">
        {FIGURES.map(({ key, label }) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="numeric mt-0.5 text-xl leading-tight font-semibold">{formatNumber(shown[key])}</dd>
          </div>
        ))}
      </dl>

      <div ref={body} className="relative min-h-0 flex-1 overflow-y-auto">
        <fieldset className="@container min-w-0 border-b pb-2">
          <legend className={LEGEND}>Status</legend>
          {MEETING_STATUSES.map((status) => (
            <FacetRow
              key={status}
              name={STATUS_LABELS[status]}
              mark={<StatusDot status={status} />}
              count={counts.status[status]}
              max={statusMax}
              checked={filters.statuses.includes(status)}
              onCheckedChange={(on) => set({ statuses: toggled(MEETING_STATUSES, filters.statuses, status, on) })}
            />
          ))}
        </fieldset>

        <fieldset className="@container min-w-0 border-b pb-2">
          <legend className={LEGEND}>Format</legend>
          {FORMAT_ORDER.map((format) => (
            <FacetRow
              key={format}
              name={FORMAT_LABELS[format]}
              mark={<FormatGlyph format={format} />}
              count={counts.format[format]}
              max={formatMax}
              checked={filters.formats.includes(format)}
              onCheckedChange={(on) => set({ formats: toggled(FORMAT_ORDER, filters.formats, format, on) })}
            />
          ))}
        </fieldset>

        <div className="flex flex-col items-start gap-1.5 border-b px-4 py-3">
          <RegionSelect regions={withChosen(counts.region, filters.region).map((t) => ({ name: t.key, count: t.count }))} allLabel="All regions" value={filters.region} onChange={(region) => set({ region })} />
          <FacetSelect
            label="Bureau or office"
            allLabel="All bureaus and offices"
            options={withChosen(counts.bureau, filters.bureau).map((t) => ({ value: t.key, label: bureaus.find((b) => b.code === t.key)?.name ?? t.key, short: t.key, hint: formatNumber(t.count) }))}
            value={filters.bureau}
            onChange={(bureau) => set({ bureau })}
          />
          <FacetSelect
            label="Topic"
            allLabel="All topics"
            options={withChosen(counts.topic, filters.topic).map((t) => ({ value: t.key, label: t.key, hint: formatNumber(t.count) }))}
            value={filters.topic}
            onChange={(topic) => set({ topic })}
          />
        </div>

        <div className="py-1.5">
          <SwitchRow label="Chairman's office attending" checked={filters.och} onCheckedChange={(och) => set({ och })} />
          <SwitchRow label="High priority only" checked={filters.high} onCheckedChange={(high) => set({ high })} />
        </div>
      </div>
    </div>
  );
}
