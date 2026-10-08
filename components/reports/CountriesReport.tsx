"use client";

import Link from "next/link";
import { Flag } from "@/components/common/Flag";
import { fyLabel } from "@/lib/domain/glance";
import type { CountryPayloadRow } from "@/lib/reports/serialize";
import { countriesTable, type ReportCell } from "@/lib/reports/tables";
import { ReportSection } from "./ReportSection";
import { ReportTable } from "./ReportTable";

/** Regions ordered by their engagements, countries by theirs within each — the map's story as a list. */
function groupedByRegion(countries: CountryPayloadRow[]): CountryPayloadRow[] {
  const totals = new Map<string, number>();
  for (const c of countries) totals.set(c.regionName, (totals.get(c.regionName) ?? 0) + c.engagements);
  const regions = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en")).map(([name]) => name);
  return regions.flatMap((region) => countries.filter((c) => c.regionName === region).sort((a, b) => b.engagements - a.engagements || a.countryName.localeCompare(b.countryName, "en")));
}

/** The country's name with its flag, linking to its dossier. */
function countryCell(value: ReportCell, column: number, row: ReportCell[]) {
  if (column !== 0 || typeof row[1] !== "string") return undefined;
  return (
    <Link href={`/countries/${row[1]}`} className="flex items-center gap-2 font-medium text-foreground underline-offset-2 hover:underline">
      <Flag code={row[1]} size={14} />
      <span className="truncate">{value}</span>
    </Link>
  );
}

/** Every country engaged, under its region, with the shape of the relationship beside it. */
export function CountriesReport({ countries, fy, csvHref }: { countries: CountryPayloadRow[]; fy: number; csvHref: string }) {
  const current = fyLabel(fy);
  return (
    <ReportSection id="report-countries" title="Countries" description={`Countries met in ${current}, grouped by region: how many engagements, how many people, when the relationship began and was last active, and what it was about.`} csvHref={csvHref}>
      <ReportTable table={countriesTable(groupedByRegion(countries))} caption={`Countries engaged in ${current}, by region`} scroll renderCell={countryCell} groupBy={(row) => String(row[2] ?? "")} />
    </ReportSection>
  );
}
