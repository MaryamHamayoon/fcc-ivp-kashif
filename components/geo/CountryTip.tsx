import { Flag } from "@/components/common/Flag";
import type { FormatMix } from "@/lib/domain/reach";
import { FORMAT_LABELS, type MeetingFormat } from "@/lib/domain/types";
import { countOf, formatDateNY } from "@/lib/format";
import { FormatBreakdown } from "./FormatGlyph";

export type TipCountry = {
  cca2: string;
  name: string;
  region: string;
  /** Meetings in the window. */
  count: number;
  participants: number;
  mix: FormatMix;
  /** The soonest meeting from today on, when there is one. */
  next: { orgName: string; start: Date | null; proposed: boolean; format: MeetingFormat } | null;
};

function when(next: NonNullable<TipCountry["next"]>): string {
  if (!next.start) return "date to be set";
  const day = formatDateNY(next.start, "monthday");
  return next.proposed ? `${day} (proposed)` : day;
}

/**
 * What the map's tooltip says about a country, the same on the card and the full screen: flag,
 * name and region; meetings and participants; the formats, told by glyph and word; and the next
 * visit. Nothing here exists only here: the card's panel and the full screen's country view say it too.
 */
export function CountryTip({ country }: { country: TipCountry }) {
  const { next } = country;
  return (
    <>
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold leading-tight">
        <Flag code={country.cca2} size={16} />
        <span className="truncate">{country.name}</span>
      </p>
      <p className="mt-0.5 text-[0.6875rem] uppercase tracking-wider text-muted-foreground">{country.region}</p>
      <p className="mt-1.5 text-xs">
        {countOf(country.count, "meeting")} <span className="text-muted-foreground">·</span> {countOf(country.participants, "participant")}
      </p>
      <FormatBreakdown mix={country.mix} className="mt-1.5 text-xs" />
      {next ? (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          Next: {next.orgName}, {when(next)} · {FORMAT_LABELS[next.format]}
        </p>
      ) : null}
    </>
  );
}
