"use client";

import { useMemo } from "react";
import { SelectFilter } from "@/components/common/SelectFilter";
import { shortRegionName } from "@/lib/domain/regions";
import type { ParamPatch } from "@/lib/url-state";

/**
 * The `Region` menu wherever the region in focus is React state rather than the URL — the map's
 * view, the Topics chart's drill-down. `SelectFilter` speaks in URL parameters, so this hands it
 * a parameter of its own and turns the answer back into a call.
 */
export function RegionSelect({
  regions,
  allLabel,
  allCount,
  value,
  onChange,
  align = "start",
}: {
  /** The regions to offer, in the order they should read; `count` is the tally beside each. */
  regions: { name: string; count: number }[];
  /** What the row that lets go of the region says: "World", "All regions". */
  allLabel: string;
  /** The tally beside that row, where there is one to give. */
  allCount?: number;
  /** The region in force by its full name; null is all of them. */
  value: string | null;
  onChange: (region: string | null) => void;
  /** Which edge of the button the list lines up with; "end" for a filter at the right of its bar. */
  align?: "start" | "end";
}) {
  const options = useMemo(() => regions.map((r) => ({ value: r.name, label: r.name, short: shortRegionName(r.name), hint: String(r.count) })), [regions]);
  const params = useMemo(() => new URLSearchParams(value ? { region: value } : {}), [value]);
  const setFilter = (patch: ParamPatch) => onChange(typeof patch.region === "string" ? patch.region : null);

  return <SelectFilter label="Region" param="region" allLabel={allLabel} allHint={allCount === undefined ? undefined : String(allCount)} options={options} params={params} setFilter={setFilter} align={align} />;
}
