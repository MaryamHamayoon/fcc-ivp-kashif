"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { downloadHref } from "@/lib/documents/href";
import { ALLOWED_MIME } from "@/lib/domain/documents";
import { DocumentGlyph } from "./DocumentGlyph";

type PreviewDoc = Pick<DocumentLibraryItem, "id" | "title" | "mime" | "preview" | "storageScheme" | "link">;

/** What a file is opened with when the browser cannot show it. */
const OPENS_WITH: Record<string, string> = {
  Word: "Word",
  PowerPoint: "PowerPoint",
  Excel: "Excel",
};

function Quiet({ doc, children }: { doc: PreviewDoc; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-6 py-10 text-center text-[0.8125rem]">
      <span className="flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground ring-1 ring-border">
        <DocumentGlyph mime={doc.mime} scheme={doc.storageScheme} className="size-5" />
      </span>
      {children}
    </div>
  );
}

function TextPreview({ id, src }: { id: string; src: string }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["document-text", id],
    queryFn: async () => {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.text();
    },
    staleTime: 60_000,
  });
  if (isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (isError) return <p className="rounded-xl border border-dashed px-6 py-10 text-center text-[0.8125rem] text-muted-foreground">The text could not be loaded.</p>;
  return <pre className="max-h-[28rem] overflow-auto rounded-xl border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{data}</pre>;
}

/**
 * The document itself, as far as a browser can show it: PDFs and images inline, text in a
 * block, Office files as a quiet panel with Download, links as a pointer to where they live.
 */
export function DocumentPreview({ doc }: { doc: PreviewDoc }) {
  if (doc.storageScheme === "link") {
    const host = doc.link ? new URL(doc.link).hostname : null;
    return (
      <Quiet doc={doc}>
        <p className="font-medium text-foreground">This document is kept outside the IVP platform.</p>
        <p className="text-muted-foreground">Its record lives here; the file stays where the program keeps it.</p>
        {doc.link ? (
          <a href={doc.link} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ExternalLink aria-hidden />
            {host?.includes("sharepoint") ? "Open in SharePoint" : "Open the link"}
          </a>
        ) : null}
      </Quiet>
    );
  }
  if (doc.storageScheme === "none") {
    return (
      <Quiet doc={doc}>
        <p className="font-medium text-foreground">No file is attached to this record.</p>
        <p className="text-muted-foreground">Upload one on the meeting’s Documents tab.</p>
      </Quiet>
    );
  }

  const src = downloadHref(doc.id);
  switch (doc.preview) {
    case "pdf":
      return (
        <div className="space-y-1.5">
          <iframe title={`Preview of ${doc.title}`} src={`${src}#toolbar=0&view=FitH`} className="h-[28rem] w-full rounded-xl border bg-muted" />
          <p className="text-right text-xs">
            <a href={src} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              Open in a new tab
            </a>
          </p>
        </div>
      );
    case "image":
      // The bytes come from a private, uncached API answer that only this session may read;
      // next/image's optimizer cannot fetch it, so the plain element is the honest choice.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={doc.title} className="max-h-[28rem] w-full rounded-xl border bg-muted object-contain" />;
    case "text":
      return <TextPreview id={doc.id} src={src} />;
    default: {
      const label = (doc.mime && ALLOWED_MIME[doc.mime]?.label) ?? "this type";
      const app = OPENS_WITH[label];
      return (
        <Quiet doc={doc}>
          <p className="font-medium text-foreground">Preview isn’t available for {label}.</p>
          <p className="text-muted-foreground">{app ? `Download it to open in ${app}.` : "Download it to open on your computer."}</p>
          <a href={downloadHref(doc.id, true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download aria-hidden />
            Download
          </a>
        </Quiet>
      );
    }
  }
}
