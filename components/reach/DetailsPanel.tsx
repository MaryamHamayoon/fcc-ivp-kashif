"use client";

import { ArrowLeft } from "lucide-react";
import { type KeyboardEvent, useEffect, useEffectEvent, useId, useMemo, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { byStart, dateToBeSet, emptyMix, type ReachData, type ReachFilters, type ReachMeeting } from "@/lib/domain/reach";
import { groupLabel, monthLabel, startOfNyDay } from "@/lib/domain/reach-time";
import { countOf } from "@/lib/format";
import type { ReachScene, ScreenCountry } from "@/lib/reach/scene";
import type { DetailsTab, Selection } from "@/lib/reach/url";
import { CountryList, NO_COUNTRIES } from "./CountryList";
import { CountryView } from "./CountryView";
import { MeetingRow } from "./MeetingRow";
import { MeetingView } from "./MeetingView";
import { DrawerClose } from "./SidePanel";

export const NOTHING_AHEAD = "Nothing ahead in this window.";

export type DetailsPanelProps = {
  /** The whole payload: names, bureaus, and the undated meetings. */
  data: ReachData;
  /** What the window holds. */
  scene: ReachScene;
  filters: ReachFilters;
  tab: DetailsTab;
  onTab: (tab: DetailsTab) => void;
  /** null, { kind: "country", cca2 } or { kind: "meeting", id } */
  selection: Selection;
  /** Choosing a row; null goes back to the list. The screen flies the camera. */
  onSelect: (selection: Selection) => void;
  /** Pointing at a row, or focusing it, lights its country on the map; null lets go. */
  onPoint: (cca2: string | null) => void;
  /** The replay is sweeping the window: the first tab lists it by month, as it passes. */
  replaying?: boolean;
  /**
   * Open as a sheet (under 768 px), the panel covers the map and the timeline. A choice made there
   * would leave focus under it, so the sheet takes focus in, onto the view's heading.
   */
  sheet?: boolean;
};

type Dated = ReachMeeting & { start: Date };
const isDated = (m: ReachMeeting): m is Dated => m.start !== null;

type Group = { label: string; meetings: ReachMeeting[] };

/** Meetings under their headings, in the order the headings first come up. */
function grouped(meetings: readonly Dated[], label: (m: Dated) => string): Group[] {
  const groups = new Map<string, ReachMeeting[]>();
  for (const m of meetings) {
    const key = label(m);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  return [...groups].map(([key, list]) => ({ label: key, meetings: list }));
}

/** What the window is read as: what is next, a past window, or the window the replay is sweeping. */
type ListMode = "ahead" | "past" | "replay";

/**
 * What the first tab lists. Upcoming meetings, soonest first, by this week, next week, then
 * month, and the meetings still waiting for a date. When the whole window is behind us, the
 * window's meetings by month, newest first; while the replay sweeps it, by month, soonest first.
 * Neither of those has an undated group.
 */
function listOf(data: ReachData, scene: ReachScene, filters: ReachFilters, mode: ListMode) {
  const now = data.asOf;
  const dated = scene.list.filter(isDated);
  if (mode === "past") return { ahead: 0, groups: grouped([...dated].sort((a, b) => byStart(b, a)), (m) => monthLabel(m.start)), undated: [] };
  if (mode === "replay") return { ahead: 0, groups: grouped([...dated].sort(byStart), (m) => monthLabel(m.start)), undated: [] };
  const today = startOfNyDay(now).getTime();
  const ahead = dated.filter((m) => m.start.getTime() >= today).sort(byStart);
  return { ahead: ahead.length, groups: grouped(ahead, (m) => groupLabel(m.start, now)), undated: [...dateToBeSet(data.meetings, filters)].sort(byStart) };
}

type View = { kind: "country"; country: ScreenCountry } | { kind: "meeting"; meeting: ReachMeeting };

/**
 * What a selection opens: a country as the window has it, or with nothing in it when the window
 * has none of its meetings; a meeting from the whole payload, since an undated one is in no
 * window. A selection the payload cannot answer opens nothing.
 */
function viewOf(selection: Selection, scene: ReachScene, data: ReachData): View | null {
  if (selection?.kind === "country") {
    const country = scene.countries.find((c) => c.cca2 === selection.cca2);
    if (country) return { kind: "country", country };
    const known = data.countries.find((c) => c.cca2 === selection.cca2);
    return known ? { kind: "country", country: { ...known, count: 0, participants: 0, mix: emptyMix(), signal: null, meetings: [] } } : null;
  }
  if (selection?.kind === "meeting") {
    const meeting = data.meetings.find((m) => m.id === selection.id);
    return meeting ? { kind: "meeting", meeting } : null;
  }
  return null;
}

/** What the panel shows, as one value an effect can follow. */
const keyOf = (selection: Selection): string => (selection === null ? "tabs" : selection.kind === "country" ? `country:${selection.cca2}` : `meeting:${selection.id}`);

/** The panel's title bar, the tab bar's and the back button's alike: a slim bar like a section's. */
const BAR = "flex min-h-10 shrink-0 items-stretch gap-3 border-b bg-muted/40 pr-4 pl-2.5";
/** A scroller: `relative`, so hidden text inside it cannot stretch the page. */
const SCROLLER = "relative min-h-0 flex-1 scroll-pt-10 overflow-y-auto";
/** A tab reads like a section's title; the active one is underlined in the brand on the bar's edge. */
const TAB =
  "heading-display h-auto flex-none px-1.5 text-sm font-semibold text-muted-foreground after:inset-x-1.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary hover:text-foreground focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-active:text-foreground";

function MeetingGroup({ label, meetings, nameOf, onChoose, onPoint }: Group & { nameOf: (cca2: string) => string; onChoose: (id: string) => void; onPoint: (cca2: string | null) => void }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <h3 id={labelId} className="eyebrow sticky top-0 z-10 border-b bg-card px-4 pt-3 pb-1.5 leading-4">
        {label}
      </h3>
      <ol className="divide-y">
        {meetings.map((m) => (
          <li key={m.id}>
            <MeetingRow meeting={m} nameOf={nameOf} onChoose={onChoose} onPoint={onPoint} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The full screen's right panel. Two tabs: Next up (Meetings, once the whole window is in the
 * past or while the replay sweeps it), the window's meetings grouped by when they fall, ending with the ones still waiting for
 * a date; and Countries, the window's countries ranked. The bar states the active tab's fact on
 * its right. Pointing at a row lights its country on the map; choosing one selects it, and the
 * panel shows that country or meeting in place of the tabs, with the way back above it. Escape
 * inside the view goes back as well.
 */
export function DetailsPanel({ data, scene, filters, tab, onTab, selection, onSelect, onPoint, replaying = false, sheet = false }: DetailsPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  /** What the panel is about to show because the reader chose it here. A selection made elsewhere, on the map, leaves focus where it is, unless a sheet now covers it. */
  const focusFor = useRef<string | null>(null);

  const past = scene.window.to.getTime() <= startOfNyDay(data.asOf).getTime();
  const mode: ListMode = replaying ? "replay" : past ? "past" : "ahead";
  /** A past window and a replayed one both read as months of meetings, not as what is next. */
  const byMonth = mode !== "ahead";
  const nameOf = useMemo(() => {
    const names = new Map(data.countries.map((c) => [c.cca2, c.name]));
    return (cca2: string) => names.get(cca2) ?? cca2;
  }, [data.countries]);
  const list = useMemo(() => listOf(data, scene, filters, mode), [data, scene, filters, mode]);
  const view = useMemo(() => viewOf(selection, scene, data), [selection, scene, data]);
  const shown = view ? keyOf(selection) : "tabs";

  // Focus follows the reader's choice: into the view, on its heading; back out, to the tab it returns to.
  // A choice made elsewhere that left focus under the sheet, which would lose it, is followed in as well.
  const follow = useEffectEvent((next: string) => {
    const wanted = focusFor.current;
    focusFor.current = null;
    const active = document.activeElement;
    const covered = sheet && (active === null || active === document.body || active.closest("[inert]") !== null);
    if (wanted !== next && !(covered && next !== "tabs")) return;
    if (next === "tabs") rootRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    else titleRef.current?.focus({ preventScroll: true });
  });
  useEffect(() => follow(shown), [shown]);

  const choose = (next: Selection) => {
    focusFor.current = keyOf(next);
    onPoint(null);
    onSelect(next);
  };
  const chooseMeeting = (id: string) => choose({ kind: "meeting", id });
  // Escape inside the view goes back as Back does, focus and all; a key something inside has used is left to it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    choose(null);
  };

  if (view) {
    return (
      <div ref={rootRef} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
        <div className={BAR}>
          <button
            type="button"
            onClick={() => choose(null)}
            className="inline-flex items-center gap-1.5 self-center rounded-md px-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to {tab === "countries" ? "Countries" : byMonth ? "Meetings" : "Next up"}
          </button>
          <DrawerClose className="ms-auto" />
        </div>
        {/* A fresh scroller for each view, so the next one opens at its top. */}
        <div key={shown} className={SCROLLER}>
          {view.kind === "country" ? (
            <CountryView country={view.country} bureaus={data.bureaus} now={data.asOf} nameOf={nameOf} onChoose={chooseMeeting} onPoint={onPoint} titleRef={titleRef} />
          ) : (
            <MeetingView meeting={view.meeting} now={data.asOf} nameOf={nameOf} titleRef={titleRef} />
          )}
        </div>
      </div>
    );
  }

  const fact = tab === "countries" ? countOf(scene.countries.length, "country", "countries") : byMonth ? countOf(scene.list.length, "meeting") : `${countOf(list.ahead, "visit")} ahead`;
  const note = scene.list.length === 0 ? NO_COUNTRIES : !byMonth && list.ahead === 0 ? NOTHING_AHEAD : null;

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <Tabs value={tab} onValueChange={(value: DetailsTab) => onTab(value)} className="min-h-0 flex-1 flex-col gap-0">
        <div className={BAR}>
          <TabsList variant="line" className="items-stretch gap-1 p-0">
            <TabsTrigger value="next" className={TAB}>
              {byMonth ? "Meetings" : "Next up"}
            </TabsTrigger>
            <TabsTrigger value="countries" className={TAB}>
              Countries
            </TabsTrigger>
          </TabsList>
          <span data-slot="section-note" className="ms-auto min-w-0 self-center truncate text-xs text-muted-foreground">
            {fact}
          </span>
          <DrawerClose />
        </div>
        {/* Out of the tab order: its rows are the stops, and the sticky headings would cover a ring drawn on the scroller. */}
        <TabsContent value="next" tabIndex={-1} className={SCROLLER}>
          {note ? <p className="px-4 py-6 text-sm text-muted-foreground">{note}</p> : null}
          {list.groups.map((g) => (
            <MeetingGroup key={g.label} {...g} nameOf={nameOf} onChoose={chooseMeeting} onPoint={onPoint} />
          ))}
          {list.undated.length > 0 ? <MeetingGroup label="Date to be set" meetings={list.undated} nameOf={nameOf} onChoose={chooseMeeting} onPoint={onPoint} /> : null}
        </TabsContent>
        <TabsContent value="countries" tabIndex={-1} className={SCROLLER}>
          <CountryList countries={scene.countries} max={scene.max} selected={null} onChoose={(cca2) => choose({ kind: "country", cca2 })} onPoint={onPoint} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
