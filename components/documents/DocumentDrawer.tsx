"use client";

import { ArrowUpRight, CopyPlus, Download, Star, StarOff } from "lucide-react";
import Link from "next/link";
import { type RefObject, useState } from "react";
import { Flag } from "@/components/common/Flag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { downloadHref } from "@/lib/documents/href";
import { formatDateNY } from "@/lib/format";
import type { DocumentDetail } from "@/lib/services/library";
import { cn } from "@/lib/utils";
import { fileLine } from "./DocumentGlyph";
import { DocumentPreview } from "./DocumentPreview";
import { useDocumentDetail } from "./useDocumentDetail";

export type DocumentDrawerProps = {
  /** The open document; null closes the drawer. */
  documentId: string | null;
  onClose: () => void;
  onReuse: (item: DocumentLibraryItem) => void;
  onToggleStar: (item: DocumentLibraryItem) => void;
  canManage: (item: DocumentLibraryItem) => boolean;
  /** The library URL that opens another document in this drawer — the provenance link. */
  hrefFor: (id: string) => string;
  /** Where focus goes when the drawer closes: the row that opened it. */
  finalFocus?: RefObject<HTMLElement | null>;
};

const hasFile = (doc: DocumentLibraryItem) => doc.storageScheme === "blob" || doc.storageScheme === "seed";

const HEADER = "border-b pr-12";

function Loading() {
  return (
    <>
      <SheetHeader className={HEADER}>
        <SheetTitle>Document</SheetTitle>
        <SheetDescription>Loading…</SheetDescription>
      </SheetHeader>
      <div aria-busy="true" className="space-y-3 p-4">
        <Skeleton className="h-[28rem] w-full rounded-xl" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </>
  );
}

function Failed({ error }: { error: Error }) {
  const message = error instanceof ApiError && error.status === 404 ? "That document could not be found." : "This document could not be loaded. Try again in a moment.";
  return (
    <>
      <SheetHeader className={HEADER}>
        <SheetTitle>Document</SheetTitle>
      </SheetHeader>
      <p role="alert" className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {message}
      </p>
    </>
  );
}

function Loaded({
  detail,
  shown,
  onSelect,
  onReuse,
  onToggleStar,
  canManage,
  hrefFor,
}: {
  detail: DocumentDetail;
  shown: DocumentLibraryItem;
  onSelect: (id: string) => void;
} & Pick<DocumentDrawerProps, "onReuse" | "onToggleStar" | "canManage" | "hrefFor">) {
  const { item, versions, source } = detail;
  const manage = canManage(item);

  return (
    <>
      <SheetHeader className={HEADER}>
        <span className="mb-1 w-fit rounded-md bg-muted px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground">{item.kindLabel}</span>
        <SheetTitle className="text-[1.0625rem] leading-snug text-balance">{item.title}</SheetTitle>
        <Link
          href={`/meetings/${item.meetingId}`}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-sm text-[0.8125rem] text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Flag code={item.countryCode} size={11} />
          <span className="numeric font-medium">{item.meetingCode}</span>
          <span className="text-muted-foreground">
            · {item.countryName} · {item.orgShortName ?? item.orgName}
          </span>
        </Link>
        <SheetDescription className="text-[0.8125rem]">
          Added by {item.addedByName ?? "—"} · {formatDateNY(item.addedAt, "short")} · {fileLine(shown)}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <DocumentPreview doc={shown} />

        {versions.length > 1 ? (
          <section>
            <h3 className="eyebrow mb-2">Versions</h3>
            <ul aria-label="Versions" className="divide-y overflow-hidden rounded-xl border">
              {versions.map((version) => {
                const active = version.id === shown.id;
                return (
                  <li key={version.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelect(version.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2 text-left text-[0.8125rem] transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        active && "bg-accent/70",
                      )}
                    >
                      <span className="numeric w-7 shrink-0 font-semibold">v{version.version}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {formatDateNY(version.addedAt, "short")} · {version.addedByName ?? "—"}
                      </span>
                      {version.isCurrent ? <span className="shrink-0 rounded-full bg-ok/10 px-1.5 py-px text-[0.625rem] font-semibold text-ok">current</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {item.sourceMeetingCode ? (
          <section>
            <h3 className="eyebrow mb-2">Provenance</h3>
            <p className="text-[0.8125rem]">
              Reused from {item.sourceMeetingCode}
              {source ? (
                <>
                  {" — "}
                  <Link href={hrefFor(source.id)} className="text-primary hover:underline">
                    {source.title}
                  </Link>
                </>
              ) : null}
            </p>
          </section>
        ) : null}
      </div>

      <SheetFooter className="flex-row flex-wrap items-center gap-2 border-t">
        {hasFile(shown) ? (
          <a href={downloadHref(shown.id, true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download aria-hidden />
            Download
          </a>
        ) : null}
        <Link href={`/meetings/${item.meetingId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          <ArrowUpRight aria-hidden />
          View meeting
        </Link>
        {manage && hasFile(item) ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onReuse(item)}>
            <CopyPlus aria-hidden />
            Reuse in a meeting…
          </Button>
        ) : null}
        {manage ? (
          <Button type="button" variant="outline" size="sm" className="ms-auto" onClick={() => onToggleStar(item)}>
            {item.reusable ? <StarOff aria-hidden /> : <Star aria-hidden className="fill-primary text-primary" />}
            {item.reusable ? "Unstar" : "Star"}
          </Button>
        ) : null}
      </SheetFooter>
    </>
  );
}

/**
 * The document, in a right-hand sheet: preview, versions, provenance and the four things one
 * does with a file. It keeps showing the last document while it slides shut, and hands focus
 * back to whatever opened it.
 */
export function DocumentDrawer({ documentId, onClose, onReuse, onToggleStar, canManage, hrefFor, finalFocus }: DocumentDrawerProps) {
  // The last document asked for, kept through the closing transition so the sheet does not
  // flash a skeleton on its way out.
  const [shownId, setShownId] = useState(documentId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (documentId !== null && documentId !== shownId) {
    setShownId(documentId);
    setSelectedId(null);
  }

  const { detail, error } = useDocumentDetail(shownId);
  const shown = (selectedId && detail?.versions.find((version) => version.id === selectedId)) || detail?.item || null;

  return (
    <Sheet
      open={documentId !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" finalFocus={finalFocus} className="gap-0 data-[side=right]:sm:max-w-[30rem]">
        {detail && shown ? (
          <Loaded detail={detail} shown={shown} onSelect={setSelectedId} onReuse={onReuse} onToggleStar={onToggleStar} canManage={canManage} hrefFor={hrefFor} />
        ) : error ? (
          <Failed error={error} />
        ) : (
          <Loading />
        )}
      </SheetContent>
    </Sheet>
  );
}
