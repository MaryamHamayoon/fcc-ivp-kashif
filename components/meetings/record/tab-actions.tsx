"use client";

import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult, ActionResultWith } from "@/lib/api/schemas";
import type { AddressBookEntry } from "@/lib/integrations/address-book";
import { DISPLAY_TZ } from "@/lib/format";

/**
 * The plumbing every editable panel on the record shares: the shape of a server action, the
 * one hook that runs one, and the alert that reports it when it fails.
 *
 * Actions arrive as props rather than imports so a panel can be rendered — and tested — with
 * nothing behind it, and so a server component decides which of them this user actually gets.
 */

export type RecordAction = (input: unknown) => Promise<ActionResult>;
export type CreateRecordAction = (input: unknown) => Promise<ActionResultWith<{ id: string }>>;
export type UploadRecordAction = (formData: FormData) => Promise<ActionResultWith<{ id: string; version: number }>>;
export type LogisticsRecordAction = (input: unknown) => Promise<ActionResultWith<{ changed: string[] }>>;
export type AddressBookAction = (q: unknown, bureauCode?: unknown) => Promise<ActionResultWith<{ entries: AddressBookEntry[] }>>;

type Outcome<T extends object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Runs one mutation: clears the last error, keeps the form usable while it is in flight,
 * toasts the outcome, and pulls fresh server data down when it worked. The failure stays in
 * `error` as well as the toast — a toast disappears, and the reason has to survive that.
 */
export function useRecordAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run<T extends object>(call: () => Promise<Outcome<T>>, options: { success: string; onDone?: (result: { ok: true } & T) => void }): void {
    setError(null);
    startTransition(async () => {
      const result = await call();
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(options.success);
      options.onDone?.(result);
      router.refresh();
    });
  }

  return { run, pending, error, clearError: () => setError(null) };
}

/** A failed mutation, announced and shown beside the control that caused it. */
export function ActionError({ message, className }: { message: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className={`flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive ${className ?? ""}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

const WALL_CLOCK_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * A stored instant as the `datetime-local` value a Washington reader expects to see.
 * `parseWallClock` (the wizard) is the inverse; the pair keeps the record on one clock.
 */
export function toWallClock(date: Date | null | undefined): string {
  if (!date) return "";
  const parts = new Map(WALL_CLOCK_PARTS.formatToParts(date).map((p): [string, string] => [p.type, p.value]));
  const get = (type: string) => parts.get(type) ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "1h 30m" — agenda durations, where a bare minute count reads as a puzzle. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
