import { File, FileSpreadsheet, FileText, FileType, Image as ImageIcon, Link2, type LucideIcon, Presentation } from "lucide-react";
import { ALLOWED_MIME, formatBytes, type StorageScheme } from "@/lib/domain/documents";
import { cn } from "@/lib/utils";

/**
 * One quiet glyph per family of file. Never coloured per type: the shelf is read by title
 * and slot, and a rainbow of icons would only compete with the status colours that matter.
 */

export type FileFamily = "pdf" | "word" | "slides" | "sheet" | "image" | "text" | "link" | "none";

export function fileFamily(mime: string | null | undefined, scheme: StorageScheme): FileFamily {
  if (scheme === "link") return "link";
  if (scheme === "none" || !mime) return "none";
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("wordprocessingml") || mime === "application/msword") return "word";
  if (mime.includes("presentationml") || mime === "application/vnd.ms-powerpoint") return "slides";
  if (mime.includes("spreadsheetml") || mime === "application/vnd.ms-excel" || mime === "text/csv") return "sheet";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "none";
}

const GLYPH: Record<FileFamily, LucideIcon> = {
  pdf: FileText,
  word: FileType,
  slides: Presentation,
  sheet: FileSpreadsheet,
  image: ImageIcon,
  text: File,
  link: Link2,
  none: File,
};

/** "PDF · 180 KB", "Link" for a file that lives elsewhere, "No file" for bare metadata. */
export function fileLine(doc: { mime: string | null; size: number | null; storageScheme: StorageScheme }): string {
  if (doc.storageScheme === "link") return "Link";
  if (doc.storageScheme === "none") return "No file";
  const label = (doc.mime && ALLOWED_MIME[doc.mime]?.label) ?? "File";
  return doc.size == null ? label : `${label} · ${formatBytes(doc.size)}`;
}

export function DocumentGlyph({ mime, scheme, className }: { mime: string | null | undefined; scheme: StorageScheme; className?: string }) {
  const Icon = GLYPH[fileFamily(mime, scheme)];
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} />;
}
