"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Flag } from "@/components/common/Flag";
import { ActionError } from "@/components/meetings/record/tab-actions";
import { selectClass } from "@/components/meetings/wizard/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api/client";
import { type ActionResultWith, type MeetingPick, MeetingPickResponse } from "@/lib/api/schemas";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS, type DocumentKind, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY } from "@/lib/format";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";

export type ReuseAction = (input: unknown) => Promise<ActionResultWith<{ id: string; code: string; version: number }>>;
export type ReuseResult = { id: string; code: string; version: number; kind: DocumentKind };

/** Active meetings, soonest first, narrowed by whatever was typed; the source's own meeting is left out. */
function useMeetingPicks(q: string, excludeMeetingId: string) {
  const query = new URLSearchParams({ pageSize: "10", ...(q ? { q } : {}) });
  const result = useQuery({
    queryKey: ["meeting-picks", q],
    queryFn: () => apiGet(`/api/meetings?${query.toString()}`, MeetingPickResponse),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const picks: MeetingPick[] = (result.data?.items ?? []).filter((meeting) => meeting.id !== excludeMeetingId);
  return { picks, isFetching: result.isFetching, isError: result.isError };
}

function ReuseForm({ source, onDone, reuse }: { source: DocumentLibraryItem; onDone: (result: ReuseResult) => void; reuse: ReuseAction }) {
  const ids = useId();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim(), 250);
  const [meeting, setMeeting] = useState<MeetingPick | null>(null);
  const [kind, setKind] = useState<DocumentKind>(source.kind);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { picks, isFetching, isError } = useMeetingPicks(q, source.meetingId);

  function submit() {
    if (!meeting) return;
    setError(null);
    startTransition(async () => {
      const result = await reuse({ sourceId: source.id, meetingId: meeting.id, kind });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Placed in ${result.code} as ${DOCUMENT_KIND_LABELS[kind]} v${result.version}`);
      onDone({ id: result.id, code: result.code, version: result.version, kind });
    });
  }

  const empty = isFetching ? "Searching…" : isError ? "Meetings are unavailable right now." : q ? "No active meeting matches that." : "There is no active meeting to place this in.";

  return (
    <div className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Reuse in a meeting</DialogTitle>
        <DialogDescription>
          Place <span className="font-medium text-foreground">{source.title}</span> on another meeting’s shelf. The file travels with a note of where it came from.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="min-w-0">
          <label htmlFor={`${ids}-q`} className="mb-1.5 block text-sm font-medium">
            Search meetings
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id={`${ids}-q`} type="search" value={text} autoComplete="off" placeholder="Country, organization, title or IVP code" onChange={(event) => setText(event.target.value)} className="h-9 pl-8" />
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-kind`} className="mb-1.5 block text-sm font-medium">
            Slot
          </label>
          <select id={`${ids}-kind`} value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)} className={selectClass}>
            {DOCUMENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="min-h-40 rounded-xl border">
        <p aria-live="polite" className="sr-only">
          {isFetching ? "Searching meetings" : `${picks.length} ${picks.length === 1 ? "meeting" : "meetings"} found`}
        </p>
        {picks.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul aria-label="Meetings" className="max-h-64 overflow-y-auto p-1">
            {/* Toggle buttons rather than an ARIA listbox: a real button gives Tab, Enter and Space for free. */}
            {picks.map((pick) => {
              const chosen = meeting?.id === pick.id;
              return (
                <li key={pick.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => setMeeting(pick)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      chosen ? "bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <Flag code={pick.countryCode} size={12} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {pick.countryName} · {pick.orgShortName ?? pick.orgName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="numeric">{pick.code}</span> · {pick.title}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{pick.scheduledStart ? formatDateNY(pick.scheduledStart, "short") : STATUS_LABELS[pick.status]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ActionError message={error} />

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="ghost" />}>Cancel</DialogClose>
        <Button type="button" disabled={!meeting || pending} onClick={submit}>
          {pending ? "Placing…" : meeting ? `Place in ${meeting.code}` : "Place in a meeting"}
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * "Reuse in a meeting": pick an active meeting and a slot, and the file is placed there with
 * its provenance. The action arrives as a prop, like every record panel's, so the dialog
 * can be rendered with nothing behind it and the page decides which action this user gets.
 */
export function ReuseDialog({
  source,
  onOpenChange,
  onDone,
  reuse,
}: {
  source: DocumentLibraryItem | null;
  onOpenChange: (open: boolean) => void;
  onDone: (result: ReuseResult) => void;
  reuse: ReuseAction;
}) {
  return (
    <Dialog open={source !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">{source ? <ReuseForm key={source.id} source={source} onDone={onDone} reuse={reuse} /> : null}</DialogContent>
    </Dialog>
  );
}
