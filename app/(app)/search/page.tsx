import { Search, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTitle } from "@/components/common/PageTitle";
import { Toolbar, ToolbarRow } from "@/components/common/toolbar/Toolbar";
import { SearchHitRow } from "@/components/search/SearchHitRow";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/lib/db/client";
import { groupHits, normalizeQuery, search } from "@/lib/services/search";

export const metadata: Metadata = { title: "Search" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const query = normalizeQuery(q);
  const ready = query.length >= 2;
  const hits = ready ? await search(await getDb(), query, 50) : [];
  const groups = groupHits(hits);

  return (
    <div className="relative space-y-6">
      <PageTitle>{ready ? `Search results for “${query}”` : "Search"}</PageTitle>

      {/* The top bar names the page; this row is the query and what it found, in the list pages' own toolbar. */}
      <Toolbar>
        <ToolbarRow className="gap-x-3 px-2 py-1.5">
          <form action="/search" method="get" role="search" className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl">
            <label htmlFor="search-q" className="sr-only">
              Search
            </label>
            <div className="relative min-w-0 flex-1">
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="search-q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Try a country, organization, topic or IVP code"
                minLength={2}
                maxLength={80}
                required
                className="h-8 w-full rounded-md border border-input bg-background pr-3 pl-8 text-[0.8125rem] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              Search
            </button>
          </form>
          <p aria-live="polite" className="ms-auto text-xs text-muted-foreground">
            {ready ? (
              <>
                <span className="font-semibold text-foreground">{plural(hits.length, "result")}</span> for “{query}” in {plural(groups.length, "group")}
              </>
            ) : (
              "Type at least two characters, then press Enter."
            )}
          </p>
        </ToolbarRow>
      </Toolbar>

      {ready && hits.length === 0 ? (
        <EmptyState icon={SearchX} title={`No matches for “${query}”.`} description="Try a country, organization, topic or IVP code." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {groups.map((group) => (
            <section key={group.kind} aria-labelledby={`search-group-${group.kind}`} className="min-w-0">
              <h2 id={`search-group-${group.kind}`} className="mb-3 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
                <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums">{group.hits.length}</span>
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft">
                {group.hits.map((hit) => (
                  <li key={`${hit.kind}:${hit.id}`}>
                    <Link href={hit.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <SearchHitRow hit={hit} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
