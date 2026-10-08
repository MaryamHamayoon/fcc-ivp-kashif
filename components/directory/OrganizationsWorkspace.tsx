"use client";

import { useCallback } from "react";
import { Pagination } from "@/components/common/Pagination";
import type { Page } from "@/lib/domain/directory-query";
import { DirectoryToolbar } from "./DirectoryToolbar";
import { OrganizationsTable, type OrganizationRowData } from "./OrganizationsTable";
import { CLEAR_DIRECTORY, hasDirectoryFilters, useDirectoryUrl } from "./useDirectoryUrl";

/** The organizations' half of the directory: the same toolbar, one page of the list, the pages under it. */
export function OrganizationsWorkspace({ page, counts }: { page: Page<OrganizationRowData>; counts: { experts: number; organizations: number } }) {
  const { params, setFilter, setPageSize, hrefForPage, isPending } = useDirectoryUrl();
  const clear = useCallback(() => setFilter(CLEAR_DIRECTORY), [setFilter]);

  return (
    <>
      <DirectoryToolbar tab="organizations" params={params} setFilter={setFilter} counts={counts} shown={page.items.length} total={page.total} />

      <div className="relative overflow-hidden rounded-xl border bg-card shadow-soft">
        <OrganizationsTable organizations={page.items} hasFilters={hasDirectoryFilters(params)} onClearFilters={clear} isPending={isPending} />
        {page.total > 0 ? <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="organizations" hrefForPage={hrefForPage} onPageSizeChange={setPageSize} className="border-t-0" /> : null}
      </div>
    </>
  );
}
