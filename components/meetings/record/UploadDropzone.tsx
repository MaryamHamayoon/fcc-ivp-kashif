"use client";

import { CloudUpload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const inlineButton = "rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60";

/**
 * The three ways a file reaches a slot: dropped on it, browsed for, or pointed at where it
 * already lives. The sentence is the control; the real `<input type="file">` stays in the tree
 * for the picker and for assistive technology, labelled by the slot it feeds.
 */
export function UploadDropzone({
  label,
  accept,
  compact = false,
  disabled = false,
  className,
  onFiles,
  onLink,
}: {
  /** The slot's name — "Briefing Deck" — which labels the file input. */
  label: string;
  accept: string;
  /** One line under an occupied slot, rather than the full target of an empty one. */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  onFiles: (files: File[]) => void;
  onLink: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled && !over) setOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    // Moving between the zone's own children fires leave/enter pairs; only a real exit dims it.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setOver(false);
    if (!disabled) take(event.dataTransfer.files);
  }

  return (
    <div
      data-testid="upload-dropzone"
      data-over={over || undefined}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors",
        compact ? "px-3 py-2" : "px-3 py-5",
        over ? "border-primary bg-accent/60" : "border-border",
        disabled && "opacity-60",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        tabIndex={-1}
        disabled={disabled}
        aria-label={`Upload ${label}`}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      {compact ? null : <CloudUpload className="mb-1.5 size-4 text-muted-foreground" aria-hidden />}
      <p className="text-xs text-muted-foreground">
        {compact ? "Drop a new version here, or " : "Drop a file here, or "}
        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className={inlineButton}>
          browse
        </button>
        {" · or "}
        <button type="button" disabled={disabled} onClick={onLink} className={inlineButton}>
          link one that already exists
        </button>
      </p>
      {compact ? null : <p className="mt-1 text-[0.6875rem] text-muted-foreground">PDF, Word, PowerPoint, Excel, images or text · up to 4 MB</p>}
    </div>
  );
}
