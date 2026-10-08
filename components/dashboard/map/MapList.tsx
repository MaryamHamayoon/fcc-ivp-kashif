import Link from "next/link";
import { Flag } from "@/components/common/Flag";
import { FormatBreakdown } from "@/components/geo/FormatGlyph";
import type { CardCountry } from "@/lib/domain/reach";
import { formatDateNY, formatNumber } from "@/lib/format";

function nextText(country: CardCountry): string {
  const next = country.next[0];
  if (!next) return "—";
  if (!next.start) return "Date to be set";
  const day = formatDateNY(next.start, "monthday");
  return next.proposed ? `${day} (proposed)` : day;
}

/**
 * The map's accessible twin: every country the card counts, with the figures the map draws —
 * meetings, participants, the formats by glyph and word, and the next meeting. It also stands in
 * for the map where the browser cannot draw it, under a line that says so.
 */
export function MapList({ countries, caption, empty, note }: { countries: readonly CardCountry[]; caption: string; empty: string; note?: string }) {
  return (
    // The card's foot row floats over the list's end: the padding lets the last row scroll clear of it.
    <div className="absolute inset-0 overflow-auto pb-10">
      {note ? <p className="border-b px-5 py-2 text-xs text-muted-foreground">{note}</p> : null}
      {countries.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-card text-left text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2">
                Country
              </th>
              <th scope="col" className="px-3 py-2">
                Region
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Meetings
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Participants
              </th>
              <th scope="col" className="px-3 py-2">
                Formats
              </th>
              <th scope="col" className="px-3 py-2">
                Next
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {countries.map((c) => (
              <tr key={c.cca2} className="hover:bg-muted/40">
                <th scope="row" className="px-5 py-2 text-left font-medium">
                  <Link href={`/countries/${c.cca2}`} className="inline-flex items-center gap-2 whitespace-nowrap hover:underline">
                    <Flag code={c.cca2} size={14} />
                    {c.name}
                  </Link>
                </th>
                <td className="px-3 py-2 text-muted-foreground">{c.region}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.count}</td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{c.participants > 0 ? formatNumber(c.participants) : "—"}</td>
                <td className="px-3 py-2">
                  <FormatBreakdown mix={c.mix} className="text-xs whitespace-nowrap" />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{nextText(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
