"use client";

import { useCallback, useState } from "react";
import { Pagination } from "@/components/common/Pagination";
import type { ExpertSort } from "@/lib/domain/directory-query";
import type { ExpertsPage, ExpertSummary } from "@/lib/services/directory";
import { type BureauCount, DirectoryToolbar } from "./DirectoryToolbar";
import { ExpertProfileDialog } from "./ExpertProfileDialog";
import { ExpertsTable } from "./ExpertsTable";
import { CLEAR_DIRECTORY, hasDirectoryFilters, useDirectoryUrl } from "./useDirectoryUrl";

/**
 * The experts' half of the directory. The server has already read the URL and sent one page of
 * the roster; this puts the toolbar over it, the pages under it, and opens a person's card
 * from their row. The card is drawn from the row's own data, so it opens at once.
 */
export function ExpertsWorkspace({ page, sort, bureaus, counts }: { page: ExpertsPage; sort: ExpertSort; bureaus: BureauCount[]; counts: { experts: number; organizations: number } }) {
  const { params, setFilter, setPageSize, hrefForPage, isPending } = useDirectoryUrl();
  const [opened, setOpened] = useState<ExpertSummary | null>(null);
  const clear = useCallback(() => setFilter(CLEAR_DIRECTORY), [setFilter]);
  const close = useCallback(() => setOpened(null), []);

  return (
    <>
      <DirectoryToolbar tab="experts" params={params} setFilter={setFilter} counts={counts} bureaus={bureaus} shown={page.items.length} total={page.total} />

      {/* `relative`: the rows hold visually hidden text, which an unpositioned box would let stretch the page. */}
      <div className="relative overflow-hidden rounded-xl border bg-card shadow-soft">
        <ExpertsTable experts={page.items} maxEngagements={page.maxEngagements} sort={sort} onOpen={setOpened} hasFilters={hasDirectoryFilters(params)} onClearFilters={clear} isPending={isPending} />
        {page.total > 0 ? <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="experts" hrefForPage={hrefForPage} onPageSizeChange={setPageSize} className="border-t-0" /> : null}
      </div>

      <ExpertProfileDialog expert={opened} onClose={close} />
    </>
  );
}
