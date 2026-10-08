"use client";

import { AlertCircle, CalendarDays, Loader2, Mail, MessageSquare, Phone, Send, UserCheck } from "lucide-react";
import { type ComponentType, type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nyDate } from "@/lib/domain/fiscal-year";
import type { ActivityKind, WaitingOn } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

/**
 * The kinds a person logs by hand. The rest of `ACTIVITY_KINDS` — status changes, holds,
 * document adds, expert replies — are written by the system when the thing itself happens,
 * so offering them here would invite a log that disagrees with the record.
 */
const COMPOSER_KINDS: { value: ActivityKind; label: string; icon: IconType }[] = [
  { value: "note", label: "Note", icon: MessageSquare },
  { value: "email_out", label: "Email sent", icon: Send },
  { value: "email_in", label: "Email received", icon: Mail },
  { value: "call", label: "Call", icon: Phone },
  { value: "date_proposed", label: "Date proposed", icon: CalendarDays },
  { value: "expert_requested", label: "Expert requested", icon: UserCheck },
];

/** Short enough for a segmented control; the legend supplies the sentence ("Waiting on … Visitor"). */
const PARTIES: { value: WaitingOn; label: string; hint: string }[] = [
  { value: "none", label: "Nobody", hint: "Nothing is blocked on this entry" },
  { value: "visitor", label: "Visitor", hint: "The visiting delegation owes us the next move" },
  { value: "expert", label: "Expert", hint: "An FCC expert or bureau owes us the next move" },
  { value: "internal", label: "OIA", hint: "The OIA front office owes us the next move" },
  { value: "och", label: "OCH", hint: "The Office of the Chairman owes us the next move" },
];

export type ComposerDraft = {
  kind: ActivityKind;
  body: string;
  waitingOn: WaitingOn;
  waitingOnLabel?: string;
  nextAction?: string;
  /** ISO instant — the chosen day at close of business in Washington. */
  nextActionDueAt?: string;
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A due date is a day, not a moment: read it as 5 p.m. in Washington, the end of that workday. */
function closeOfBusiness(day: string): Date | null {
  const match = DAY.exec(day.trim());
  if (!match) return null;
  const date = nyDate(Number(match[1]), Number(match[2]), Number(match[3]), 17, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The composer that opens the Activity tab. One pass down it captures everything the
 * waiting-on engine, the attention rail and the reports derive from: what happened, who
 * owes the next move, and what that move is.
 *
 * `onSubmit` answers `true` when the entry was saved; only then is the form cleared, so a
 * server refusal never costs the coordinator their words.
 */
export function ActivityComposer({ onSubmit, className }: { onSubmit: (draft: ComposerDraft) => Promise<boolean>; className?: string }) {
  const ids = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [kind, setKind] = useState<ActivityKind>("note");
  const [body, setBody] = useState("");
  const [waitingOn, setWaitingOn] = useState<WaitingOn>("none");
  const [who, setWho] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [due, setDue] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  // The record header's "Log activity" button links here; arriving on the hash should land in the box.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#composer") bodyRef.current?.focus();
  }, []);

  const empty = body.trim() === "";
  const error = attempted && empty ? "Say what happened — one line is enough to keep the record self-explaining." : undefined;

  async function send(): Promise<void> {
    setAttempted(true);
    if (busy || body.trim() === "") return;
    setBusy(true);
    const dueAt = due === "" ? null : closeOfBusiness(due);
    const saved = await onSubmit({
      kind,
      body: body.trim(),
      waitingOn,
      waitingOnLabel: waitingOn === "none" || who.trim() === "" ? undefined : who.trim(),
      nextAction: nextAction.trim() === "" ? undefined : nextAction.trim(),
      nextActionDueAt: dueAt?.toISOString(),
    });
    setBusy(false);
    if (!saved) return;
    setKind("note");
    setBody("");
    setWaitingOn("none");
    setWho("");
    setNextAction("");
    setDue("");
    setAttempted(false);
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void send();
  }

  function onBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form onSubmit={onFormSubmit} className={cn("min-w-0", className)}>
      <fieldset className="min-w-0">
        <legend className="sr-only">Kind of entry</legend>
        <div className="flex flex-wrap gap-1.5">
          {COMPOSER_KINDS.map((option) => {
            const id = `${ids}-kind-${option.value}`;
            const selected = kind === option.value;
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                htmlFor={id}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  selected ? "border-primary/50 bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                <input id={id} type="radio" name={`${ids}-kind`} value={option.value} checked={selected} onChange={() => setKind(option.value)} className="sr-only" />
                <Icon className={cn("size-3.5", selected ? "text-primary" : "text-muted-foreground")} aria-hidden />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3">
        <label htmlFor={`${ids}-body`} className="sr-only">
          What happened?
        </label>
        <Textarea
          id={`${ids}-body`}
          ref={bodyRef}
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onBodyKeyDown}
          placeholder="What happened? — e.g. Sent the draft agenda and asked for the final delegation roster."
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ids}-body-error` : `${ids}-body-hint`}
          className="min-h-20 text-sm"
        />
        {error ? (
          <p id={`${ids}-body-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : (
          <p id={`${ids}-body-hint`} className="mt-1.5 text-xs text-muted-foreground">
            Plain words, written for whoever picks this meeting up next.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium">Waiting on</legend>
          <div className="inline-flex w-full min-w-0 rounded-lg border bg-muted/40 p-0.5">
            {PARTIES.map((party) => {
              const id = `${ids}-wait-${party.value}`;
              const selected = waitingOn === party.value;
              return (
                <label
                  key={party.value}
                  htmlFor={id}
                  title={party.hint}
                  className={cn(
                    "min-w-0 flex-1 cursor-pointer rounded-[7px] px-2 py-1 text-center text-xs font-medium transition-colors",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    selected ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <input id={id} type="radio" name={`${ids}-wait`} value={party.value} checked={selected} onChange={() => setWaitingOn(party.value)} className="sr-only" />
                  {party.label}
                </label>
              );
            })}
          </div>

          {waitingOn === "none" ? (
            <p className="mt-1.5 text-xs text-muted-foreground">Nothing is blocked on this entry.</p>
          ) : (
            <div className="mt-2">
              <label htmlFor={`${ids}-who`} className="mb-1 block text-xs font-medium text-muted-foreground">
                Who exactly?
              </label>
              <Input id={`${ids}-who`} value={who} onChange={(event) => setWho(event.target.value)} placeholder="e.g. MoC Lithuania POC" aria-describedby={`${ids}-who-hint`} />
              <p id={`${ids}-who-hint`} className="mt-1 text-xs text-muted-foreground">
                The name the next coordinator would chase.
              </p>
            </div>
          )}
        </fieldset>

        <div className="min-w-0">
          <label htmlFor={`${ids}-next`} className="mb-1.5 block text-sm font-medium">
            Next action
          </label>
          <Input id={`${ids}-next`} value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="e.g. Re-send the roster request" />
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`${ids}-due`} className="text-xs font-medium text-muted-foreground">
              Due
            </label>
            <Input id={`${ids}-due`} type="date" value={due} onChange={(event) => setDue(event.target.value)} className="numeric w-auto" aria-describedby={`${ids}-due-hint`} />
            <span id={`${ids}-due-hint`} className="text-xs text-muted-foreground">
              Washington time
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <p className="text-xs text-muted-foreground">
          <kbd className="numeric rounded border bg-muted px-1 py-0.5 text-[0.625rem]">Ctrl</kbd> + <kbd className="numeric rounded border bg-muted px-1 py-0.5 text-[0.625rem]">Enter</kbd> to log
        </p>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Send className="size-3.5" aria-hidden />}
          Log activity
        </Button>
      </div>
    </form>
  );
}
