import type { ParticipantCategory } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

export type ParticipantTally = { category: ParticipantCategory; planned: number; actual: number | null };

/**
 * Who is in the room, as the four numbers the annual report asks for. Planned counts stand
 * until the meeting happens; once it has, actual counts take the headline and planned drops to
 * a comparison — the gap between the two is exactly what OIA gets asked about.
 */

const GROUPS: { key: string; label: string; categories: ParticipantCategory[] }[] = [
  { key: "usg", label: "FCC / USG", categories: ["fcc", "other_usg"] },
  { key: "foreign", label: "Foreign Gov", categories: ["foreign_gov"] },
  { key: "industry", label: "Industry", categories: ["industry"] },
];

function sum(totals: ParticipantTally[], categories: ParticipantCategory[] | null, field: "planned" | "actual"): number {
  return totals.filter((t) => categories === null || categories.includes(t.category)).reduce((acc, t) => acc + (field === "planned" ? t.planned : (t.actual ?? 0)), 0);
}

export function ParticipantsSummary({ totals, showActual, className }: { totals: ParticipantTally[]; /** The meeting has happened: lead with what actually turned up. */ showActual: boolean; className?: string }) {
  const hasActual = showActual && totals.some((t) => t.actual !== null);
  const tiles = [
    ...GROUPS.map((g) => ({ key: g.key, label: g.label, planned: sum(totals, g.categories, "planned"), actual: sum(totals, g.categories, "actual") })),
    { key: "total", label: "Total", planned: sum(totals, null, "planned"), actual: sum(totals, null, "actual") },
  ];

  return (
    <Panel id="participants-heading" eyebrow={hasActual ? "Who attended" : "Who is expected"} title="Participants" className={className}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => {
          const headline = hasActual ? tile.actual : tile.planned;
          const isTotal = tile.key === "total";
          return (
            <div key={tile.key} className={cn("rounded-2xl border px-3 py-3", isTotal ? "border-primary/25 bg-primary/6" : "bg-muted/35")}>
              <dt className="text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{tile.label}</dt>
              <dd className="mt-1">
                <span className={cn("numeric block text-2xl leading-none font-medium tabular-nums", isTotal ? "text-primary" : "text-foreground")}>{formatNumber(headline)}</span>
                <span className="mt-1 block text-[0.6875rem] text-muted-foreground">{hasActual ? `${formatNumber(tile.planned)} planned` : "planned"}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      {totals.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No counts recorded yet — add them on the People tab.</p> : null}
    </Panel>
  );
}
