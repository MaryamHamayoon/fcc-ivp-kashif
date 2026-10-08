"use client";

import { Download, ExternalLink, FileText, Loader2, Star, Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { TextField } from "@/components/meetings/wizard/fields";
import { buttonVariants } from "@/components/ui/button";
import { downloadHref } from "@/lib/documents/href";
import { ACCEPT_ATTRIBUTE, formatBytes, storageScheme, typeLabel, validateUpload } from "@/lib/domain/documents";
import { DOCUMENT_KIND_LABELS, type DocumentKind } from "@/lib/domain/types";
import { formatDateNY } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { ActionError, type CreateRecordAction, type RecordAction, type UploadRecordAction, useRecordAction } from "./tab-actions";
import { UploadDropzone } from "./UploadDropzone";

export type DocumentEntry = MeetingRecord["documents"][number];

/** The four slots readiness actually counts; the rest are useful, not required. */
const REQUIRED: Partial<Record<DocumentKind, string>> = {
  agenda_final: "Readiness check",
  briefing_deck: "Readiness check",
  participant_list: "Readiness check",
};

const HINTS: Record<DocumentKind, string> = {
  work_plan: "The internal plan for the visit.",
  agenda_draft: "Circulated for comment.",
  agenda_final: "What the delegation receives.",
  briefing_deck: "What the briefers present.",
  participant_list: "The delegation roster, as received.",
  bio_packet: "Who is coming, and why they matter.",
  readout: "What was agreed, written after the visit.",
  other: "Anything else the next coordinator would want.",
};

const FULL_ADDRESS = /^https?:\/\//i;

function hostOf(address: string): string {
  try {
    return new URL(address).hostname;
  } catch {
    return address;
  }
}

/**
 * One typed shelf. The eight kinds are fixed on purpose: a named slot answers "is the final
 * agenda done?" at a glance, where a flat file list only answers "are there files?".
 *
 * A file dropped here is checked in the browser first — size and type — so the only reasons
 * that reach the server are the ones the browser cannot know. Uploading into an occupied
 * slot adds the next version; the top row is always the current one.
 */
export function DocumentSlot({
  meetingId,
  kind,
  documents,
  canAdd,
  addDocument,
  uploadDocument,
  toggleReusable,
  removeDocument,
  onOpen,
}: {
  meetingId: string;
  kind: DocumentKind;
  /** Every version on file for this kind, newest first. */
  documents: DocumentEntry[];
  canAdd: boolean;
  addDocument: CreateRecordAction;
  uploadDocument: UploadRecordAction;
  toggleReusable: RecordAction;
  removeDocument: RecordAction;
  /** Opens a document in the drawer. */
  onOpen: (id: string) => void;
}) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [adding, setAdding] = useState(false);
  /** Why the last chosen file was turned away before it was sent. */
  const [refused, setRefused] = useState<string | null>(null);
  /** The name of the file in flight, while there is one. */
  const [uploading, setUploading] = useState<string | null>(null);
  const label = DOCUMENT_KIND_LABELS[kind];
  const present = documents.length > 0;

  function upload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setRefused(null);
    const check = validateUpload({ name: file.name, mime: file.type, size: file.size });
    if (!check.ok) {
      setRefused(check.reason);
      return;
    }
    const form = new FormData();
    form.set("meetingId", meetingId);
    form.set("kind", kind);
    form.set("reusable", "false");
    form.set("file", file);
    setUploading(file.name);
    run(
      async () => {
        try {
          return await uploadDocument(form);
        } finally {
          setUploading(null);
        }
      },
      { success: `${label} uploaded.` },
    );
  }

  const zone = adding ? (
    <AddDocumentForm
      idPrefix={ids}
      label={label}
      pending={pending}
      className={present ? "border-t pt-3" : undefined}
      onCancel={() => setAdding(false)}
      onSubmit={(title, reusable, link) =>
        run(() => addDocument({ meetingId, kind, title, reusable, ...(link ? { storageKey: link } : {}) }), {
          success: link ? `${label} linked.` : `${label} recorded.`,
          onDone: () => setAdding(false),
        })
      }
    />
  ) : uploading ? (
    <UploadProgress name={uploading} />
  ) : (
    <UploadDropzone
      label={label}
      accept={ACCEPT_ATTRIBUTE}
      compact={present}
      disabled={pending}
      className={present ? undefined : "h-full"}
      onFiles={upload}
      onLink={() => {
        setRefused(null);
        setAdding(true);
      }}
    />
  );

  return (
    <section role="group" aria-labelledby={`${ids}-title`} className="flex min-w-0 flex-col rounded-2xl border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${ids}-title`} className="flex items-center gap-2 text-sm font-semibold">
            <FileText className={cn("size-3.5 shrink-0", present ? "text-ok" : "text-muted-foreground")} aria-hidden />
            {label}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{HINTS[kind]}</p>
        </div>
        {REQUIRED[kind] ? <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{REQUIRED[kind]}</span> : null}
      </header>

      <div className="mt-3 flex-1">
        {present ? (
          <ul className="space-y-2">
            {documents.map((doc, index) => {
              const scheme = storageScheme(doc.storageKey);
              const isFile = scheme === "blob" || scheme === "seed";
              const address = scheme === "link" && doc.storageKey && FULL_ADDRESS.test(doc.storageKey) ? doc.storageKey : null;
              const meta = [`v${doc.version}`, isFile ? `${typeLabel(doc.mime)} · ${formatBytes(doc.size)}` : null, doc.addedBy?.name ?? "Unknown", formatDateNY(doc.addedAt, "short")].filter(Boolean).join(" · ");
              return (
                <li key={doc.id} className="flex items-start gap-2 rounded-xl bg-muted/40 px-2.5 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Open ${doc.title}`}
                        onClick={() => onOpen(doc.id)}
                        className="block min-w-0 max-w-full truncate rounded-sm text-left text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {doc.title}
                      </button>
                      {index === 0 && documents.length > 1 ? <span className="shrink-0 rounded-full bg-ok/10 px-1.5 py-px text-[0.625rem] font-semibold text-ok">current</span> : null}
                    </div>
                    <p className="numeric truncate text-xs text-muted-foreground">{meta}</p>
                    {scheme === "link" ? (
                      address ? (
                        <a href={address} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
                          <ExternalLink className="size-3 shrink-0" aria-hidden />
                          <span className="truncate">{hostOf(address)}</span>
                        </a>
                      ) : (
                        <p className="truncate text-xs text-muted-foreground" title={doc.storageKey ?? undefined}>
                          {doc.storageKey}
                        </p>
                      )
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {isFile ? (
                      <a href={downloadHref(doc.id, true)} aria-label={`Download ${doc.title}`} className={buttonVariants({ variant: "ghost", size: "icon-sm" })}>
                        <Download aria-hidden />
                      </a>
                    ) : null}
                    {canAdd ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Mark ${doc.title} as ${doc.reusable ? "no longer reusable" : "reusable"}`}
                          onClick={() => run(() => toggleReusable({ meetingId, id: doc.id, reusable: !doc.reusable }), { success: doc.reusable ? "Removed from reusable materials." : "Starred as reusable." })}
                          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                        >
                          <Star className={cn(doc.reusable && "fill-primary text-primary")} aria-hidden />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          aria-label={`Remove ${doc.title}`}
                          onClick={() => run(() => removeDocument({ meetingId, id: doc.id }), { success: `${doc.title} removed.` })}
                          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                        >
                          <Trash2 aria-hidden />
                        </button>
                      </>
                    ) : doc.reusable ? (
                      <Star className="mt-0.5 size-3.5 shrink-0 fill-primary text-primary" aria-label="Reusable" />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : canAdd ? (
          zone
        ) : (
          <p className="text-sm text-muted-foreground">Nothing on file.</p>
        )}
      </div>

      <ActionError message={refused ?? error} className="mt-3" />

      {present && canAdd ? <div className="mt-3">{zone}</div> : null}
    </section>
  );
}

/** A file on its way up: the name, and a bar that moves until the server answers. */
function UploadProgress({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-dashed px-3 py-2.5">
      <p className="truncate text-xs text-muted-foreground">
        Uploading <span className="font-medium text-foreground">{name}</span>…
      </p>
      <div role="progressbar" aria-label={`Uploading ${name}`} aria-valuetext="Uploading…" className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-indeterminate rounded-full bg-primary" />
      </div>
    </div>
  );
}

/** A record without an upload: a title, where the file already lives, and whether it is worth keeping for next time. */
function AddDocumentForm({
  idPrefix,
  label,
  pending,
  className,
  onSubmit,
  onCancel,
}: {
  idPrefix: string;
  label: string;
  pending: boolean;
  className?: string;
  onSubmit: (title: string, reusable: boolean, link: string | null) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [reusable, setReusable] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const titleError = title.trim().length < 2 ? "Give the document a title." : undefined;
  const linkError = link.trim() && !FULL_ADDRESS.test(link.trim()) ? "Enter the full address, starting with https://." : undefined;

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAttempted(true);
    if (titleError || linkError) return;
    onSubmit(title.trim(), reusable, link.trim() || null);
  }

  return (
    <form onSubmit={submit} noValidate className={cn("grid gap-3", className)}>
      <TextField id={`${idPrefix}-title-input`} label="Title" value={title} onChange={setTitle} error={attempted ? titleError : undefined} placeholder={`${label} — ARTCI study visit`} autoComplete="off" />
      <TextField
        id={`${idPrefix}-link-input`}
        label="Link"
        type="url"
        inputMode="url"
        optional
        value={link}
        onChange={setLink}
        error={attempted ? linkError : undefined}
        hint="Where the file already lives — SharePoint, or anywhere the program keeps it."
        placeholder="https://fcc.sharepoint.com/sites/oia/…"
        autoComplete="off"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={reusable} onChange={(event) => setReusable(event.target.checked)} className="size-3.5 accent-[var(--color-primary)]" />
        Worth reusing on the next visit
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Cancel
        </button>
        <button type="submit" disabled={pending} className={buttonVariants({ variant: "outline", size: "sm" })}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save
        </button>
      </div>
    </form>
  );
}
