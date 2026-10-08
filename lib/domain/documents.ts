import type { DocumentKind } from "./types";

/**
 * The rules a document obeys, with no database in sight: how versions are numbered, which
 * files may be uploaded, what the drawer can show, how a download is named, and when a file
 * may be reused on another meeting. Services and components call these; nothing here does.
 */

/** The upload ceiling, stated in the UI; the SharePoint adapter lifts it in Phase 4. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type PreviewKind = "pdf" | "image" | "text";

export const ALLOWED_MIME: Record<string, { ext: string; label: string; preview: PreviewKind | null }> = {
  "application/pdf": { ext: "pdf", label: "PDF", preview: "pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", label: "Word", preview: null },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", label: "PowerPoint", preview: null },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", label: "Excel", preview: null },
  "image/png": { ext: "png", label: "PNG image", preview: "image" },
  "image/jpeg": { ext: "jpg", label: "JPEG image", preview: "image" },
  "text/plain": { ext: "txt", label: "Text", preview: "text" },
  "text/markdown": { ext: "md", label: "Markdown", preview: "text" },
  "text/csv": { ext: "csv", label: "CSV", preview: "text" },
};

const EXT_TO_MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(ALLOWED_MIME).map(([mime, v]) => [v.ext, mime])),
  jpeg: "image/jpeg",
  markdown: "text/markdown",
};

/** What the slot says when a file is turned away. */
export const ACCEPTED_TYPES_SENTENCE = "PDF, Word, PowerPoint, Excel, images, text";

/** For `<input type="file" accept>`: the MIME list plus extensions, since some browsers only match one of them. */
export const ACCEPT_ATTRIBUTE = [...Object.keys(ALLOWED_MIME), ".pdf", ".docx", ".pptx", ".xlsx", ".png", ".jpg", ".jpeg", ".txt", ".md", ".csv"].join(",");

/**
 * What a storage key points at. `blob` is bytes IVP holds; `seed` is a seeded document the
 * synthesizer renders on request; `link` is metadata about a file that lives elsewhere.
 */
export type StorageScheme = "blob" | "seed" | "link" | "none";

export function storageScheme(key: string | null | undefined): StorageScheme {
  if (!key) return "none";
  if (key.startsWith("blob://")) return "blob";
  if (key.startsWith("seed://")) return "seed";
  return "link";
}

/** Versions are derived, never typed: re-adding a kind supersedes what is on the shelf. */
export function nextVersion(existing: readonly { kind: DocumentKind; version: number }[], kind: DocumentKind): number {
  return Math.max(0, ...existing.filter((d) => d.kind === kind).map((d) => d.version)) + 1;
}

/** The highest version of each kind — what the slot shows first and what readiness reads. */
export function currentVersions<T extends { kind: DocumentKind; version: number }>(docs: readonly T[]): Set<T> {
  const best = new Map<DocumentKind, T>();
  for (const doc of docs) {
    const seen = best.get(doc.kind);
    if (!seen || doc.version > seen.version) best.set(doc.kind, doc);
  }
  return new Set(best.values());
}

const extensionOf = (name: string): string => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** The browser's MIME wins when it is on the list; otherwise the extension may still vouch for the file. */
export function resolveMime(name: string, mime: string): string | null {
  if (mime in ALLOWED_MIME) return mime;
  return EXT_TO_MIME[extensionOf(name)] ?? null;
}

export type UploadCheck = { ok: true; ext: string; mime: string } | { ok: false; reason: string };

export function validateUpload(file: { name: string; mime: string; size: number }): UploadCheck {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "Over 4 MB — trim the file, or link it from SharePoint instead." };
  if (file.size <= 0) return { ok: false, reason: "That file is empty." };
  const mime = resolveMime(file.name, file.mime);
  if (!mime) return { ok: false, reason: `This kind of file isn't accepted (${ACCEPTED_TYPES_SENTENCE}).` };
  return { ok: true, ext: ALLOWED_MIME[mime]!.ext, mime };
}

export function isPreviewable(mime: string | null | undefined): PreviewKind | null {
  return mime ? (ALLOWED_MIME[mime]?.preview ?? null) : null;
}

/** "PDF", "PowerPoint", … or "Link" for metadata-only rows. */
export function typeLabel(mime: string | null | undefined): string {
  return mime ? (ALLOWED_MIME[mime]?.label ?? "File") : "Link";
}

/** A download name from a title: ASCII, hyphenated, never empty. */
export function safeFilename(title: string, ext: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "document"}.${ext}`;
}

/** Bytes as people read them; one decimal while the number is small enough for it to matter. */
export function formatBytes(size: number | null | undefined): string {
  if (size == null) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) {
    const kb = size / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export type ReuseCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether a file may be placed in another meeting's slot. Only files IVP can produce —
 * uploads and seeded documents — travel; a SharePoint link has no bytes to carry.
 */
export function reuseCheck(
  source: { id: string; meetingId: string; storageKey: string | null },
  target: { meetingId: string; docs: readonly { storageKey: string | null; kind: DocumentKind }[] },
  kind: DocumentKind,
): ReuseCheck {
  if (source.meetingId === target.meetingId) return { ok: false, reason: "That document already belongs to this meeting." };
  const scheme = storageScheme(source.storageKey);
  if (scheme === "link" || scheme === "none") return { ok: false, reason: "Only files the IVP platform holds can be reused; this one is a link." };
  if (target.docs.some((d) => d.kind === kind && d.storageKey === source.storageKey)) return { ok: false, reason: "This slot already holds that exact file." };
  return { ok: true };
}
