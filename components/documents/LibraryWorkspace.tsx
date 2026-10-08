"use client";

import { useCallback, useRef, useState } from "react";
import { reuseDocumentAction } from "@/app/(app)/meetings/[id]/actions";
import { PageTitle } from "@/components/common/PageTitle";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { libraryDocHref } from "@/lib/documents/href";
import type { PolicyUser } from "@/lib/domain/policy";
import { DocumentDrawer } from "./DocumentDrawer";
import { LibraryTable } from "./LibraryTable";
import { LibraryToolbar } from "./LibraryToolbar";
import type { LibraryOptions } from "./options";
import { ReuseDialog } from "./ReuseDialog";
import { ReuseStrip } from "./ReuseStrip";
import { useDocumentActions } from "./useDocumentActions";
import { CLEAR_EVERYTHING, DEFAULT_PAGE_SIZE, hasActiveFilters, MAX_PAGE_SIZE, readPageSize, useLibraryQuery, useLibraryUrl } from "./useLibraryQuery";

/**
 * The document library. The URL holds every filter, the sort, how many rows are loaded and
 * which document is open; this component turns that into a request and back into a shelf.
 */
export function LibraryWorkspace({ options, user }: { options: LibraryOptions; user: PolicyUser }) {
  const { params, setParams, setFilter, hrefFor, docId, openDoc } = useLibraryUrl();
  const { refresh, canManage, onToggleStar, onRemove } = useDocumentActions(user);
  const [reuseItem, setReuseItem] = useState<DocumentLibraryItem | null>(null);
  /** The control that opened the drawer, so focus can return to it when the drawer closes. */
  const openerRef = useRef<HTMLElement | null>(null);

  const pageSize = readPageSize(params);
  const { items, total, isPending, isFetching, isError, refetch } = useLibraryQuery(params);

  const onOpen = useCallback(
    (id: string, opener: HTMLElement) => {
      openerRef.current = opener;
      openDoc(id);
    },
    [openDoc],
  );

  const clearAll = useCallback(() => setFilter(CLEAR_EVERYTHING), [setFilter]);
  const loadMore = useCallback(() => setParams({ pageSize: String(Math.min(MAX_PAGE_SIZE, pageSize + DEFAULT_PAGE_SIZE)) }), [pageSize, setParams]);

  return (
    <div className="relative space-y-4">
      <PageTitle>Documents</PageTitle>

      <LibraryToolbar params={params} options={options} shown={items.length} total={total} isLoading={isPending} hrefFor={hrefFor} setFilter={setFilter} onClearAll={clearAll} />

      {/* The by-topic strip belongs to the Reuse-ready shelf; on the full shelf it was one more row of chips above the list. */}
      {params.get("reusable") === "true" ? <ReuseStrip topics={options.reusableTopics} total={options.reusableTotal} params={params} setFilter={setFilter} /> : null}

      <LibraryTable
        items={items}
        total={total}
        canManage={canManage}
        onOpen={onOpen}
        onReuse={setReuseItem}
        onToggleStar={onToggleStar}
        onRemove={onRemove}
        isLoading={isPending || (isFetching && items.length === 0)}
        isError={isError}
        hasFilters={hasActiveFilters(params)}
        onClearFilters={clearAll}
        onRetry={() => void refetch()}
        canLoadMore={items.length < total && pageSize < MAX_PAGE_SIZE}
        onLoadMore={loadMore}
      />

      <DocumentDrawer documentId={docId} onClose={() => openDoc(null)} onReuse={setReuseItem} onToggleStar={onToggleStar} canManage={canManage} hrefFor={(id) => libraryDocHref(id, params)} finalFocus={openerRef} />
      <ReuseDialog
        source={reuseItem}
        onOpenChange={(open) => {
          if (!open) setReuseItem(null);
        }}
        onDone={() => {
          setReuseItem(null);
          refresh();
        }}
        reuse={reuseDocumentAction}
      />
    </div>
  );
}
