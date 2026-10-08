"use client";

import { ArrowRight, Star } from "lucide-react";
import Link from "next/link";
import { DocumentGlyph } from "@/components/documents/DocumentGlyph";
import type { Material } from "@/lib/domain/dossier";
import { formatNumber } from "@/lib/format";

export type MaterialsShelfProps = {
  materials: Material[];
  /** Every current document on the subject's meetings, not just the shelf's few. */
  total: number;
  /** The library filtered to this subject. */
  href: string;
  /** "Kenya", "Ofcom" — names the link to the rest. */
  subject: string;
  /** Opens a document; `opener` is where focus returns when it closes. */
  onOpen: (id: string, opener: HTMLElement) => void;
};

/** The few documents worth reaching for first — reusable ones ahead of the rest — with the way to all of them. */
export function MaterialsShelf({ materials, total, href, subject, onOpen }: MaterialsShelfProps) {
  if (materials.length === 0) {
    return <p className="rounded-xl border border-dashed bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">No materials on file yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <ul aria-label="Materials" className="divide-y">
        {materials.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
              <DocumentGlyph mime={m.mime} scheme={m.scheme} />
            </span>
            <span className="min-w-0 flex-1">
              <button type="button" onClick={(event) => onOpen(m.id, event.currentTarget)} className="block max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {m.title}
              </button>
              <span className="block truncate text-xs text-muted-foreground">
                {m.kindLabel} · {m.meetingCode}
              </span>
            </span>
            {m.reusable ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <Star aria-hidden className="size-3 fill-primary text-primary" />
                Reusable
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <Link href={href} className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset">
        <span>All materials for {subject}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="numeric">{formatNumber(total)}</span>
          <ArrowRight aria-hidden className="size-3.5 text-primary" />
        </span>
      </Link>
    </div>
  );
}
