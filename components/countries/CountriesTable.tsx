import Link from "next/link";
import { Flag } from "@/components/common/Flag";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateNY, formatNumber } from "@/lib/format";
import type { CountrySummary } from "@/lib/services/directory";

/** Every country the program has engaged, ranked by this fiscal year's count. A plain server-rendered table — each row's only interactive element is its name link. */
export function CountriesTable({ countries }: { countries: CountrySummary[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <Table>
        <caption className="sr-only">Countries the program has engaged, ranked by this fiscal year&apos;s engagement count</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Country</TableHead>
            <TableHead scope="col">Region</TableHead>
            <TableHead scope="col" className="text-right">
              This FY
            </TableHead>
            <TableHead scope="col">Last engaged</TableHead>
            <TableHead scope="col">Top topics</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {countries.map((country) => (
            <TableRow key={country.cca2}>
              <TableCell>
                <Link
                  href={`/countries/${country.cca2}`}
                  className="flex items-center gap-2 font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm"
                >
                  <Flag code={country.cca2} size={14} />
                  {country.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{country.regionName}</TableCell>
              <TableCell className="numeric text-right">{formatNumber(country.fyCount)}</TableCell>
              <TableCell className="text-muted-foreground">{country.lastEngagedAt ? formatDateNY(country.lastEngagedAt) : "—"}</TableCell>
              <TableCell>
                {country.topTopics.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {country.topTopics.map((topic) => (
                      <span key={topic.key} className="max-w-32 truncate rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">
                        {topic.label}
                      </span>
                    ))}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
