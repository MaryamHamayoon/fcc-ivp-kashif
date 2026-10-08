"use client";

import { Activity, ArrowRightLeft, CalendarDays, Check, Clock, FileText, Loader2, Mail, MessageSquare, Phone, Send, UserCheck } from "lucide-react";
import { motion } from "motion/react";
import { type ComponentType, type FormEvent, useId, useState } from "react";
import { UserAvatar } from "@/components/common/Avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { businessDaysBetween } from "@/lib/domain/business-days";
import { ACTIVITY_KIND_LABELS, type ActivityKind, WAITING_ON_LABELS } from "@/lib/domain/types";
import { ageBand, type AgeBand } from "@/lib/domain/waiting-on";
import { formatDateNY, relativeAge } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ActivityEntryView } from "./activity-entries";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/** Same vocabulary as the dashboard's recent-activity list, extended to the kinds a coordinator types. */
const ICONS: Partial<Record<ActivityKind, IconType>> = {
  note: MessageSquare,
  email_out: Send,
  email_in: Mail,
  call: Phone,
  date_proposed: CalendarDays,
  date_confirmed: CalendarDays,
  expert_requested: UserCheck,
  expert_confirmed: UserCheck,
  expert_declined: UserCheck,
  document_added: FileText,
  status_change: ArrowRightLeft,
  hold: ArrowRightLeft,
  resume: ArrowRightLeft,
};

/** Entries IVP writes for itself: a one-line ledger, not a note anyone composed. */
const SYSTEM_KINDS = new Set<ActivityKind>(["status_change", "hold", "resume", "system"]);

const BAND: Record<AgeBand, { box: string; ring: string; dot: string; text: string }> = {
  ok: { box: "border-age-ok/35 bg-card wash-ok", ring: "border-age-ok/45 bg-age-ok/10 text-age-ok", dot: "bg-age-ok", text: "text-age-ok" },
  warn: { box: "border-age-warn/40 bg-card wash-warn", ring: "border-age-warn/50 bg-age-warn/12 text-age-warn", dot: "bg-age-warn", text: "text-age-warn" },
  alert: { box: "border-age-alert/45 bg-card wash-alert", ring: "border-age-alert/55 bg-age-alert/12 text-age-alert", dot: "bg-age-alert", text: "text-age-alert" },
};

/** "Marcus Bell" → "Marcus B." — enough to attribute a system row without crowding it. */
function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;
  return `${words[0]} ${words[words.length - 1]?.[0] ?? ""}.`;
}

const stamp = (date: Date) => ({ dateTime: date.toISOString(), title: formatDateNY(date, "full") });

export type ActivityEntryProps = {
  entry: ActivityEntryView;
  now: Date;
  /** DOM id for the entry — `waiting` on the one the rail's "Resolve" link points at. */
  anchor?: string;
  /** Whether this reader may close an open waiting entry. */
  canResolve: boolean;
  /** Closes the entry; resolves `true` when the server accepted it. */
  onResolve: (entryId: string, note: string) => Promise<boolean>;
  /** Just posted from the composer: fade it in once. Everything already on the page stays still. */
  reveal?: boolean;
};

/**
 * One line of the record's story. A person's entry gets an author, a kind and the body they
 * typed; an entry that names someone we are waiting on also carries its age in the band color
 * the dashboard uses, and — for anyone who may log activity — the button that closes it out.
 */
export function ActivityEntry({ entry, now, anchor, canResolve, onResolve, reveal = false }: ActivityEntryProps) {
  const Icon = ICONS[entry.kind] ?? Activity;
  const time = formatDateNY(entry.occurredAt, "time");

  if (SYSTEM_KINDS.has(entry.kind)) {
    return (
      <li id={anchor} className="flex items-center gap-2.5 py-2 pl-0.5 text-xs text-muted-foreground">
        <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="size-3" aria-hidden />
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{entry.body}</span> · by {shortName(entry.authorName)}
        </span>
        <time {...stamp(entry.occurredAt)} className="numeric ml-auto shrink-0 tracking-tight">
          {time}
        </time>
      </li>
    );
  }

  const waiting = entry.waitingOn !== "none";
  const open = waiting && entry.resolvedAt === null;
  const days = open ? businessDaysBetween(entry.occurredAt, now) : 0;
  const band = BAND[ageBand(days)];

  return (
    <motion.li id={anchor} initial={reveal ? { opacity: 0, y: -6 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} className="flex scroll-mt-28 gap-3 py-3">
      <span aria-hidden className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground", open && band.ring)}>
        <Icon className="size-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UserAvatar name={entry.authorName} size="xs" decorative />
          <span className="text-sm font-medium text-foreground">{entry.authorName}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{ACTIVITY_KIND_LABELS[entry.kind]}</span>
          <time {...stamp(entry.occurredAt)} className="numeric ml-auto shrink-0 text-xs text-muted-foreground">
            {time}
          </time>
        </p>

        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground">{entry.body}</p>

        {waiting ? <WaitingBlock entry={entry} now={now} days={days} band={band} open={open} canResolve={canResolve} onResolve={onResolve} /> : null}
      </div>
    </motion.li>
  );
}

function WaitingBlock({
  entry,
  now,
  days,
  band,
  open,
  canResolve,
  onResolve,
}: {
  entry: ActivityEntryView;
  now: Date;
  days: number;
  band: (typeof BAND)[AgeBand];
  open: boolean;
  canResolve: boolean;
  onResolve: (entryId: string, note: string) => Promise<boolean>;
}) {
  // Same fallback the waiting-on engine uses, so the entry and the rail never name it differently.
  const label = entry.waitingOnLabel?.trim() || WAITING_ON_LABELS[entry.waitingOn];

  if (!open) {
    return (
      <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 shrink-0 text-ok" aria-hidden />
        <span>
          Resolved{entry.resolvedByName ? ` · ${entry.resolvedByName}` : ""}
          {entry.resolvedAt ? ` · ${formatDateNY(entry.resolvedAt, "short")}` : ""}
        </span>
        {/* Inherits the line's muted colour: fading it further put this clause under 4.5:1. */}
        <span>— had been waiting on {label}</span>
      </p>
    );
  }

  return (
    <div className={cn("mt-2.5 rounded-xl border px-3 py-2.5", band.box)}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", band.dot)} />
        <span className="font-medium text-foreground">Waiting on {label}</span>
        <span className={cn("numeric font-semibold", band.text)}>
          {days} business {days === 1 ? "day" : "days"}
        </span>
      </p>

      {entry.nextAction ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className="text-foreground">Next: {entry.nextAction}</span>
          {entry.nextActionDueAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" aria-hidden />
              due {formatDateNY(entry.nextActionDueAt, "short")} · {relativeAge(entry.nextActionDueAt, now)}
            </span>
          ) : null}
        </p>
      ) : null}

      {canResolve ? <ResolveForm entryId={entry.id} label={label} onResolve={onResolve} /> : null}
    </div>
  );
}

/** Closing an entry is a two-step: the button, then one optional line saying what closed it. */
function ResolveForm({ entryId, label, onResolve }: { entryId: string; label: string; onResolve: (entryId: string, note: string) => Promise<boolean>; }) {
  const noteId = useId();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const accepted = await onResolve(entryId, note.trim());
    setBusy(false);
    if (accepted) {
      setNote("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="xs" variant="outline" className="mt-2.5" onClick={() => setOpen(true)}>
        Resolve
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2.5 border-t border-border/60 pt-2.5">
      <label htmlFor={noteId} className="sr-only">
        Resolution note
      </label>
      <Textarea id={noteId} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What closed it out? Optional — it is logged as its own note." className="min-h-14 text-sm" aria-describedby={`${noteId}-hint`} />
      <p id={`${noteId}-hint`} className="mt-1 text-[0.6875rem] text-muted-foreground">
        We stop counting the days against {label}.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Button type="submit" size="xs" disabled={busy}>
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
          Mark resolved
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
