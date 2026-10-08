"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, FileDown, FileText, Globe, History, Loader2, type LucideIcon, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SearchHitRow } from "@/components/search/SearchHitRow";
import { Command, CommandDialog, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { apiGet } from "@/lib/api/client";
import { SearchResponse } from "@/lib/api/schemas";
import { triggerDownload } from "@/lib/download";
import { openPreferences } from "@/lib/preferences/open";
import { briefPdfHref } from "@/lib/reports/href";
import { groupHits, normalizeQuery } from "@/lib/services/search";
import { useDebounced } from "@/lib/use-debounced";
import { OPEN_SEARCH_EVENT } from "./SearchButton";

type Navigate = (href: string) => void;
type PaletteAction = { id: string; icon: LucideIcon; label: string; hint: string; keywords: string; run: (go: Navigate) => void };

/**
 * Things the palette can do rather than find. Kept short on purpose — this is a search box
 * first. The reports pair appears only for a reader the policy lets read reports, so the
 * palette never offers a page that would answer with a 403.
 */
function actionsFor(canReadReports: boolean, currentFy: number): PaletteAction[] {
  return [
    { id: "activity", icon: History, label: "Open activity log", hint: "Every entry on every meeting, newest first", keywords: "activity log feed history follow-ups waiting emails calls notes audit", run: (go) => go("/activity") },
    { id: "documents", icon: FileText, label: "Open document library", hint: "Every file, by country, topic or meeting", keywords: "documents files library materials decks agendas uploads", run: (go) => go("/documents") },
    { id: "reach", icon: Globe, label: "Open Global reach", hint: "The full-screen map, with its filters and timeline", keywords: "global reach map world countries full screen timeline tour", run: (go) => go("/reach") },
    ...(canReadReports
      ? [
          { id: "reports", icon: BarChart3, label: "Open reports", hint: "Tallies, tables and exports", keywords: "reports tallies counts export csv excel xlsx", run: (go: Navigate) => go("/reports") },
          { id: "brief", icon: FileDown, label: "Download the executive brief", hint: `FY${currentFy} one-pager, PDF`, keywords: "brief executive pdf summary one page one-pager", run: () => triggerDownload(briefPdfHref(currentFy)) },
        ]
      : []),
    {
      id: "preferences",
      icon: SlidersHorizontal,
      label: "Display & accessibility",
      hint: "Theme, text size, contrast, motion",
      keywords: "theme dark light appearance text size contrast motion typeface font settings display accessibility",
      run: () => openPreferences(),
    },
  ];
}

function matchingActions(text: string, actions: PaletteAction[]) {
  const needle = text.trim().toLowerCase();
  if (!needle) return actions;
  return actions.filter((action) => action.label.toLowerCase().includes(needle) || action.keywords.includes(needle));
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1 py-px font-mono text-[0.625rem] text-muted-foreground">{children}</kbd>;
}

/**
 * Global search palette: ⌘K / Ctrl+K anywhere, or the top-bar button (which
 * dispatches OPEN_SEARCH_EVENT; the palette claims it with preventDefault).
 */
export function CommandPalette({ canReadReports, currentFy }: { canReadReports: boolean; currentFy: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const q = useDebounced(normalizeQuery(text), 150);
  const enabled = open && q.length >= 2;

  const { data, isFetching, isError } = useQuery({
    queryKey: ["search", q],
    queryFn: () => apiGet(`/api/search?q=${encodeURIComponent(q)}`, SearchResponse),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const hits = enabled ? (data?.hits ?? []) : [];
  const groups = groupHits(hits);
  const allActions = useMemo(() => actionsFor(canReadReports, currentFy), [canReadReports, currentFy]);
  const actions = matchingActions(text, allActions);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = (e: Event) => {
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setText("");
  }, []);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const status = isFetching ? "Searching…" : enabled ? (isError ? "Search is unavailable right now." : `${hits.length} ${hits.length === 1 ? "result" : "results"}`) : "";

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Type to search meetings, organizations, countries, people, topics, notes and documents." className="sm:max-w-2xl">
      <Command shouldFilter={false} loop label="Search">
        <CommandInput value={text} onValueChange={setText} placeholder="Search meetings, countries, people, documents…" aria-label="Search" autoFocus />
        {/* The prompt and the no-matches line sit outside the list: an ARIA listbox with no
            options in it is a malformed widget, so the list only exists when it has results. */}
        {q.length < 2 ? <p className="px-3 py-8 text-center text-sm text-muted-foreground">Type at least two characters — a country, an organization, a topic or an IVP code.</p> : null}
        {enabled && !isFetching && hits.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{isError ? "Search is unavailable right now." : `No matches for “${q}”. Try a country, organization, topic or IVP code.`}</p>
        ) : null}
        <CommandList className="max-h-[60vh]" hidden={groups.length === 0 && actions.length === 0}>
          {groups.map((group) => (
            <CommandGroup key={group.kind} heading={group.label}>
              {group.hits.map((hit) => (
                <CommandItem key={`${hit.kind}:${hit.id}`} value={`${hit.kind}:${hit.id}`} onSelect={() => go(hit.href)} className="py-2">
                  <SearchHitRow hit={hit} compact />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          {enabled && hits.length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__all" onSelect={() => go(`/search?q=${encodeURIComponent(q)}`)} className="text-primary">
                  <ArrowRight aria-hidden />
                  See all results for “{q}”
                </CommandItem>
              </CommandGroup>
            </>
          ) : null}
          {actions.length > 0 ? (
            <>
              {groups.length > 0 ? <CommandSeparator /> : null}
              <CommandGroup heading="Actions">
                {actions.map(({ icon: Icon, ...action }) => (
                  <CommandItem
                    key={action.id}
                    value={`__action:${action.id}`}
                    onSelect={() => {
                      onOpenChange(false);
                      action.run((href) => router.push(href));
                    }}
                  >
                    <Icon aria-hidden />
                    <span>{action.label}</span>
                    <span className="ml-auto text-[0.6875rem] text-muted-foreground">{action.hint}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
        <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-[0.6875rem] text-muted-foreground">
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            {isFetching ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {status}
          </span>
          <span className="hidden items-center gap-2 sm:inline-flex">
            <Kbd>↑↓</Kbd> navigate <Kbd>↵</Kbd> open <Kbd>esc</Kbd> close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}
