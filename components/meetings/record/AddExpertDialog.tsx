"use client";

import { Loader2, Search, UserPlus } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { SelectField, selectClass } from "@/components/meetings/wizard/fields";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EXPERT_ROLES, type ExpertRole } from "@/lib/domain/types";
import type { AddressBookEntry } from "@/lib/integrations/address-book";
import { cn } from "@/lib/utils";
import { ActionError, useRecordAction, type AddressBookAction, type CreateRecordAction } from "./tab-actions";

/**
 * Adds a briefer straight from the FCC Global Address Book.
 *
 * The list is typed into, not scrolled: the search runs on the server (Phase 4 swaps the seeded
 * directory for Microsoft Graph behind the same call), debounced so a fast typist sends one
 * query rather than nine. People already on the meeting stay visible but unselectable — seeing
 * that someone is already assigned answers the question that made you open this dialog.
 */

const ROLE_LABELS: Record<ExpertRole, string> = { lead: "Lead briefer", briefer: "Briefer", attendee: "Attending" };
const DEBOUNCE_MS = 220;
const MIN_QUERY = 2;

export type BureauOption = { code: string; name: string };

export function AddExpertDialog({
  meetingId,
  assignedStaffIds,
  bureaus,
  addExpert,
  searchAddressBook,
}: {
  meetingId: string;
  assignedStaffIds: string[];
  bureaus: BureauOption[];
  addExpert: CreateRecordAction;
  searchAddressBook: AddressBookAction;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonVariants({ variant: "outline", size: "sm" })}>
        <UserPlus aria-hidden />
        Add expert
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          {open ? (
            <AddExpertForm
              meetingId={meetingId}
              assignedStaffIds={assignedStaffIds}
              bureaus={bureaus}
              addExpert={addExpert}
              searchAddressBook={searchAddressBook}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddExpertForm({
  meetingId,
  assignedStaffIds,
  bureaus,
  addExpert,
  searchAddressBook,
  onClose,
}: {
  meetingId: string;
  assignedStaffIds: string[];
  bureaus: BureauOption[];
  addExpert: CreateRecordAction;
  searchAddressBook: AddressBookAction;
  onClose: () => void;
}) {
  const ids = useId();
  const { run, pending, error } = useRecordAction();
  const [query, setQuery] = useState("");
  const [bureauCode, setBureauCode] = useState("");
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<AddressBookEntry | null>(null);
  const [role, setRole] = useState<ExpertRole>("briefer");
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const assigned = new Set(assignedStaffIds);

  /** Debounced in a ref rather than an effect: typing is the event, so typing owns the timer. */
  function schedule(nextQuery: string, nextBureau: string): void {
    if (timer.current) clearTimeout(timer.current);
    if (nextQuery.trim().length < MIN_QUERY && nextBureau === "") {
      setEntries([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const result = await searchAddressBook(nextQuery.trim(), nextBureau === "" ? undefined : nextBureau);
        setEntries(result.ok ? result.entries : []);
        setSearched(true);
      });
    }, DEBOUNCE_MS);
  }

  function submit(): void {
    if (!selected) return;
    run(() => addExpert({ meetingId, staffId: selected.id, role }), {
      success: `${selected.name} added to this meeting.`,
      onDone: onClose,
    });
  }

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add an FCC expert</DialogTitle>
        <DialogDescription>Search the FCC Global Address Book by name, title or email. Adding somebody does not ask them yet — send the request from their row.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="min-w-0">
          <label htmlFor={`${ids}-q`} className="mb-1.5 block text-sm font-medium">
            Search the address book
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={`${ids}-q`}
              value={query}
              autoComplete="off"
              placeholder="Name, title or email"
              aria-describedby={`${ids}-status`}
              onChange={(event) => {
                setQuery(event.target.value);
                schedule(event.target.value, bureauCode);
              }}
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-bureau`} className="mb-1.5 block text-sm font-medium">
            Bureau
          </label>
          <select
            id={`${ids}-bureau`}
            value={bureauCode}
            onChange={(event) => {
              setBureauCode(event.target.value);
              schedule(query, event.target.value);
            }}
            className={cn(selectClass, bureauCode === "" && "text-muted-foreground")}
          >
            <option value="">Any bureau</option>
            {bureaus.map((bureau) => (
              <option key={bureau.code} value={bureau.code}>
                {bureau.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-40 rounded-xl border">
        <p id={`${ids}-status`} aria-live="polite" className="sr-only">
          {searching ? "Searching the address book" : `${entries.length} people found`}
        </p>
        {searching ? (
          <p className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
          </p>
        ) : entries.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{searched ? "Nobody in the address book matches that." : "Type at least two letters, or pick a bureau."}</p>
        ) : (
          <ul aria-label="Address book results" className="max-h-60 overflow-y-auto p-1">
            {/* A plain list of toggle buttons, not an ARIA listbox: `role="option"` may not wrap a
                focusable control, and a real button gives Tab, Enter and Space for free. */}
            {entries.map((entry) => {
              const already = assigned.has(entry.id);
              const chosen = selected?.id === entry.id;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    disabled={already}
                    aria-pressed={already ? undefined : chosen}
                    onClick={() => setSelected(entry)}
                    className={cn(
                      "flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      chosen ? "bg-accent" : "hover:bg-muted/60",
                      already && "cursor-not-allowed opacity-55 hover:bg-transparent",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{entry.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{entry.title ?? entry.email}</span>
                    </span>
                    <span className="numeric shrink-0 text-xs text-muted-foreground">{already ? "on this meeting" : (entry.bureauCode ?? "—")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SelectField id={`${ids}-role`} label="Role on this meeting" value={role} onChange={(value) => setRole(value as ExpertRole)} className="sm:w-1/2">
        {EXPERT_ROLES.map((option) => (
          <option key={option} value={option}>
            {ROLE_LABELS[option]}
          </option>
        ))}
      </SelectField>

      <ActionError message={error} />

      <DialogFooter>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </button>
        <button type="button" disabled={!selected || pending} onClick={submit} className={buttonVariants()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {selected ? `Add ${selected.name}` : "Add expert"}
        </button>
      </DialogFooter>
    </div>
  );
}
