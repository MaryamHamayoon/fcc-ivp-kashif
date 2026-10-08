"use client";

import { Globe, ListFilter, Minus, Plus, Rows3 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from "react";
import { CountryTip } from "@/components/geo/CountryTip";
import { MapLegend } from "@/components/geo/MapLegend";
import { NO_WEBGL, ReachMap, type ReachMapHandle, useCanDrawMap } from "@/components/geo/ReachMap";
import { useMapTheme } from "@/components/geo/useMapTheme";
import { useSignalsPaused } from "@/components/geo/useSignalsPaused";
import { SkipLink } from "@/components/shell/SkipLink";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { announce, NO_FILTERS, type ReachData, type ReachFilters, type ReachMeeting, searchEntries, type SearchEntry, tourStops } from "@/lib/domain/reach";
import { type RangeKey, rangeText, type Span, windowText } from "@/lib/domain/reach-time";
import { countOf } from "@/lib/format";
import { ramp } from "@/lib/geo/map-palette";
import type { CameraMove } from "@/lib/geo/reach-engine";
import { signalMode } from "@/lib/geo/signals";
import { useReducedMotion } from "@/lib/motion";
import { RailSurface } from "@/lib/rail-surface";
import { DETAILS_WIDTH, EDGE, FILTERS_WIDTH, panelsTucked, reachLayout, TIMELINE_HEIGHT, TOUR_PADDING, TUCKED_TIMELINE_HEIGHT } from "@/lib/reach/layout";
import { canReplay } from "@/lib/reach/replay";
import { nextOf, openingCamera, reachScene, regionCamera, sceneRange, selectedCountry, tourScene } from "@/lib/reach/scene";
import { snapWindow, timelineMeetings } from "@/lib/reach/timeline";
import type { DetailsTab, ReachView, Selection } from "@/lib/reach/url";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { awayTo, SLIDE } from "./away";
import { CountryList } from "./CountryList";
import { DetailsPanel } from "./DetailsPanel";
import { FiltersPanel } from "./FiltersPanel";
import type { ReachSearchHandle } from "./ReachSearch";
import { ReachSkeleton } from "./ReachSkeleton";
import { ReachStrip, StripMenu } from "./ReachStrip";
import { ReplayButton, ReplayCaption } from "./Replay";
import { type PanelMode, PanelsButton, SidePanel } from "./SidePanel";
import { StripSearch } from "./StripSearch";
import { Timeline } from "./Timeline";
import { TimelineBar } from "./TimelineBar";
import { Tour, TourButton } from "./Tour";
import { usePanelsChoice } from "./usePanelsChoice";
import { usePresence } from "./usePresence";
import { useReachView } from "./useReachView";
import { useReplay } from "./useReplay";
import { useTour } from "./useTour";
import { useViewportWidth } from "./useViewportWidth";

/** One of the map's own controls: an icon button, named, with the name as its tooltip. */
function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={label} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** How long the page waits after a filter or range change before its live region states the result. */
const SAY_AFTER_MS = 600;

type ReachScreenProps = { data: ReachData; initial: ReachView };

/**
 * The full screen: the map fills the window and the chrome floats over it. The view
 * lives in the URL, and everything shown is derived from it in `reachScene`. The strip is the
 * banner; `main` holds, in reading and tab order, the Filters panel, the map, the Details panel
 * and the timeline. The camera frames into whatever the chrome leaves free. Tucked, the panels
 * wait behind edge tabs and the timeline is a strip of marks. Under 768 px the strip and the
 * ranges fold into menus, and a drawer takes the window's width. While the tour runs, the chrome
 * slides away and the tour's own pill and caption card take its place. Nothing is laid out until
 * the page knows the window's width: the server renders the skeleton.
 */
function Screen({ data, initial }: ReachScreenProps) {
  const theme = useMapTheme();
  const reduce = useReducedMotion();
  const canDraw = useCanDrawMap();
  const [paused, setPaused] = useSignalsPaused();
  const [view, setView] = useReachView(initial, data);
  const [highlight, setHighlight] = useState<string | null>(null);
  const width = useViewportWidth();
  const [choice, setChoice] = usePanelsChoice();
  const { padding, tucked, compact } = reachLayout({ width, tucked: panelsTucked(choice, width) });
  /** The tucked panel open over the map as a drawer, if any. */
  const [drawer, setDrawer] = useState<"filters" | "details" | null>(null);
  // Tucked, the timeline is a strip of marks; it grows back while the pointer or focus is on it.
  const [usingTimeline, timelinePresence] = usePresence();
  const grown = !tucked || usingTimeline;
  const hydrated = useHydrated();
  // Under 768 px the search opens across the strip, and the title steps aside for it.
  const [searching, setSearching] = useState(false);
  const mapRef = useRef<ReachMapHandle>(null);
  const searchRef = useRef<ReachSearchHandle>(null);
  const tour = useTour();
  const touring = tour.active;
  const tourRef = useRef<HTMLButtonElement>(null);
  /** Where the reader left the camera when the tour began: the tour hands the map back there. */
  const returnTo = useRef<CameraMove | null>(null);
  const sentenceId = useId();
  const filtersId = useId();
  const detailsId = useId();
  const timelineId = useId();

  // The range stands whatever the window. The replay sweeps it, and while it plays its window stands in
  // for the view's without ever reaching the URL; reaching the end gives the whole range back.
  const range = useMemo(() => sceneRange(data, view.range), [data, view.range]);
  const replay = useReplay({ span: range, reduce: reduce === true, onEnd: () => setView((v) => ({ ...v, window: null })) });
  const scene = useMemo(() => reachScene(data, replay.window ? { ...view, window: replay.window } : view), [data, view, replay.window]);
  const shading = useMemo(() => ramp(theme.palette, scene.max), [theme.palette, scene.max]);
  const selected = selectedCountry(view.selection, data);
  const entries = useMemo(() => searchEntries(data), [data]);
  const byCode = useMemo(() => new Map(data.countries.map((c) => [c.cca2, c])), [data.countries]);
  const nameOf = useMemo(() => (cca2: string) => byCode.get(cca2)?.name ?? cca2, [byCode]);
  // Up to 12 visits in the next 90 days, through the filters. The tour keeps its own copy once it starts.
  const stops = useMemo(() => tourStops(data.meetings, view.filters, data.asOf), [data.meetings, view.filters, data.asOf]);
  const onTour = useMemo(() => (touring ? tourScene(tour.stops, tour.index, data) : null), [touring, tour.stops, tour.index, data]);
  // The timeline draws the whole range through the filters, and fades what the window leaves out. A drag
  // or a replay moves only the window, so neither lays it out again.
  const onTimeline = useMemo(() => timelineMeetings(data.meetings, view.filters, range), [data.meetings, view.filters, range]);
  // Where the program's calendar runs out, whatever the filters: its last dated meeting still standing.
  const lastBooked = useMemo(() => data.meetings.reduce<Date | null>((last, m) => (m.start && m.status !== "cancelled" && (!last || m.start > last) ? m.start : last), null), [data.meetings]);

  const chooseRange = (key: RangeKey) => setView((v) => ({ ...v, range: key, window: null }));
  const clearWindow = () => setView((v) => ({ ...v, window: null }));
  // Pause keeps the window the replay reached, in whole days, as the reader's own: the URL takes it then, once.
  const pauseReplay = () => {
    const reached = replay.pause();
    if (reached) setView((v) => ({ ...v, window: snapWindow(reached, range) }));
  };
  // A drag reports the window while it moves (`live`); the URL follows it at most every 250 ms.
  const moveWindow = (next: Span | null, { live }: { live: boolean }) => setView((v) => ({ ...v, window: next }), { live });
  // Choosing a country or a meeting selects it and flies to its country; a meeting held only in the United States stays put.
  const select = (selection: Selection) => {
    setView((v) => ({ ...v, selection }));
    // Tucked, the Details panel opens as a drawer to show what was chosen; focus stays where the reader is.
    if (selection && tucked) setDrawer("details");
    const cca2 = selectedCountry(selection, data);
    if (cca2) mapRef.current?.move({ kind: "country", cca2 });
  };
  const chooseCountry = (cca2: string) => select({ kind: "country", cca2 });
  const chooseMeeting = (meeting: ReachMeeting) => select({ kind: "meeting", id: meeting.id });
  // Search reaches the whole history: a country is selected, and an organization selects its country.
  const find = (entry: SearchEntry) => select({ kind: "country", cca2: entry.cca2 });
  const chooseTab = (tab: DetailsTab) => setView((v) => ({ ...v, tab }));
  const chooseFilters = (filters: ReachFilters) => {
    setView((v) => ({ ...v, filters }));
    // A new region frames its countries with meetings under the new filters; All regions goes home.
    if (filters.region !== view.filters.region) mapRef.current?.move(regionCamera(filters.region, reachScene(data, { ...view, filters }), data));
  };
  const resetFilters = () => {
    setView((v) => ({ ...v, filters: NO_FILTERS }));
    mapRef.current?.move({ kind: "world" });
  };
  // While the tour tells its visits, the map is the tour's: a click there chooses nothing, and it shows no tooltips.
  const selectOnMap = (cca2: string | null) => {
    if (touring) return;
    setView((v) => ({ ...v, selection: cca2 ? { kind: "country", cca2 } : null }));
    if (cca2 && tucked) setDrawer("details");
  };
  const renderTip = (cca2: string) => {
    const c = touring ? undefined : scene.countries.find((country) => country.cca2 === cca2);
    if (!c) return null;
    const next = nextOf(c, data.asOf);
    return <CountryTip country={{ ...c, next: next && { orgName: next.orgName, start: next.start, proposed: next.proposed, format: next.format } }} />;
  };

  // Panels tucks both panels away or brings them back; the choice is kept for this browser.
  const togglePanels = () => {
    setDrawer(null);
    setChoice(tucked ? "open" : "tucked");
  };
  // Under 768 px an open drawer is a sheet: it runs down over the timeline to the window's foot, and what it
  // covers (the map, the other panel's tab and the timeline) is out of reach while it is open.
  const sheet = compact && drawer !== null;
  const timelineAway = touring || sheet;
  // Beside the map, behind its edge tab, open over the map, or away while the tour runs or a sheet covers its
  // tab. A drawer the tour interrupts is open again after it, as the reader left it.
  const modeOf = (panel: "filters" | "details"): PanelMode => (touring ? "away" : !tucked ? "docked" : drawer === panel ? "drawer" : sheet ? "away" : "tucked");

  // The tour takes the whole screen. It keeps where the reader left the camera, to hand the map back there.
  const startTour = () => {
    replay.stop();
    returnTo.current = mapRef.current?.camera() ?? null;
    setHighlight(null);
    tour.start(stops);
  };

  // The single-key shortcuts belong to the focused map, so they never take a letter from a reader typing or
  // speaking elsewhere (WCAG 2.1.4): / for search, T for the tour, P for the panels. With a modifier, held
  // down, or while the tour runs, the keys are left alone.
  const onMapKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (touring || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === "/") searchRef.current?.focus();
    else if (key === "t" && stops.length > 0) startTour();
    else if (key === "p" && !compact) togglePanels();
    else return;
    event.preventDefault();
  };

  // The camera follows the tour visit by visit, then frames them all for the summary. When the tour ends,
  // the camera goes back to where the reader left it and focus returns to the Tour button. That runs once
  // the chrome is back, so the camera frames into the space the panels leave free.
  const toured = useRef(false);
  useEffect(() => {
    if (onTour) {
      toured.current = true;
      mapRef.current?.move(onTour.camera);
      return;
    }
    if (!toured.current) return;
    toured.current = false;
    if (returnTo.current) mapRef.current?.move(returnTo.current);
    returnTo.current = null;
    tourRef.current?.focus();
  }, [onTour]);

  // Cmd+K or Ctrl+K reaches search from anywhere on the page. It carries a modifier, so it never takes a
  // letter from a reader typing or speaking; the single-key / works only on the map (WCAG 2.1.4).
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Escape steps back one thing at a time, nearest the focus first, and never leaves the page. A drawer, and
  // a country or a meeting open in the Details panel, take the Escapes pressed inside them; anywhere else it
  // clears the selection, then closes an open drawer. A key something else has used (a field, a menu, the
  // tooltip, the tour) has had its default prevented, and is left alone.
  const onEscape = useEffectEvent((event: globalThis.KeyboardEvent) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (view.selection) setView((v) => ({ ...v, selection: null }));
    else if (tucked && drawer) setDrawer(null);
    else return;
    event.preventDefault();
  });
  useEffect(() => {
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, []);

  // After a filter or range change, the live region states the result once the reader pauses. Only those two
  // count: moving the window is the reader's own gesture, and the replay moves it many times a second. A
  // change made while the replay plays is not stated either, since the window it counts moves on at once.
  const [said, setSaid] = useState("");
  const heard = useRef({ filters: view.filters, range: view.range });
  const say = useEffectEvent(() => {
    if (replay.playing) return;
    const result = announce(scene.list);
    // A screen reader repeats only a change: a result the same as the last is told apart by a trailing no-break space.
    setSaid((last) => (last === result ? `${result}\u00a0` : result));
  });
  useEffect(() => {
    if (heard.current.filters === view.filters && heard.current.range === view.range) return;
    heard.current = { filters: view.filters, range: view.range };
    const timer = setTimeout(say, SAY_AFTER_MS);
    return () => clearTimeout(timer);
  }, [view.filters, view.range]);

  if (!hydrated) return <ReachSkeleton />;

  const countries = <CountryList countries={scene.countries} max={scene.max} selected={selected} onChoose={chooseCountry} onPoint={setHighlight} />;
  const fallback = (
    <div className="absolute grid place-items-center" style={{ ...padding }}>
      <div data-rail-surface="" className="glass flex max-h-full w-full max-w-md flex-col overflow-hidden">
        <p className="border-b px-4 py-3 text-sm text-muted-foreground">{NO_WEBGL}</p>
        <div className="relative min-h-0 overflow-y-auto">{countries}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--map-water)]">
      <SkipLink href="#map">Skip to the map</SkipLink>
      <ReachStrip fact={windowText(view.range, scene.window, scene.narrowed)} away={touring} compact={compact} searching={compact && searching}>
        <StripSearch ref={searchRef} compact={compact} open={searching} onOpenChange={setSearching} entries={entries} onChoose={find} />
        {/* Under 768 px the panels are always tucked, so Panels goes, and the tour moves into the strip's menu. */}
        {compact ? (
          <StripMenu ref={tourRef} count={stops.length} onTour={startTour} />
        ) : (
          <>
            <TourButton ref={tourRef} count={stops.length} onStart={startTour} />
            <PanelsButton tucked={tucked} onToggle={togglePanels} />
          </>
        )}
      </ReachStrip>

      <main className="absolute inset-0">
        <SidePanel
          side="left"
          label="Filters"
          icon={<ListFilter />}
          titleId={filtersId}
          mode={modeOf("filters")}
          width={FILTERS_WIDTH}
          full={compact}
          top={padding.top}
          bottom={compact ? EDGE : padding.bottom}
          onOpen={() => setDrawer("filters")}
          onClose={() => setDrawer(null)}
        >
          <FiltersPanel titleId={filtersId} meetings={data.meetings} window={scene.window} list={scene.list} filters={view.filters} bureaus={data.bureaus} onChange={chooseFilters} onReset={resetFilters} />
        </SidePanel>

        {/* Outside the map, which a sheet takes out of reach: a filter chosen in the Filters sheet is still said. */}
        <p role="status" className="sr-only">
          {said}
        </p>
        <div id="map" inert={sheet} tabIndex={-1} className="absolute inset-0 outline-none">
          <h2 className="sr-only">Map</h2>
          <p id={sentenceId} className="sr-only">
            {scene.sentence}
          </p>
          <ReachMap
            ref={mapRef}
            mode="explore"
            theme={theme}
            marks={onTour?.countries ?? scene.countries}
            ramp={shading}
            signals={signalMode({ paused, reducedMotion: reduce === true, tourPaused: touring && tour.paused, replaying: replay.playing })}
            focus={onTour?.focus ?? null}
            selected={touring ? null : selected}
            highlight={touring ? null : highlight}
            padding={touring ? TOUR_PADDING : padding}
            places={data.countries}
            view={openingCamera(view, scene, data)}
            describedBy={sentenceId}
            renderTip={renderTip}
            onSelect={selectOnMap}
            onKeyDown={onMapKey}
            fallback={fallback}
          />
          {canDraw && !touring ? (
            <>
              <div data-rail-surface="" className="glass absolute z-[5] flex flex-col p-0.5" style={{ left: padding.left, top: padding.top }}>
                <MapButton label="Zoom in" onClick={() => mapRef.current?.zoomBy(1)}>
                  <Plus aria-hidden />
                </MapButton>
                <MapButton label="Zoom out" onClick={() => mapRef.current?.zoomBy(-1)}>
                  <Minus aria-hidden />
                </MapButton>
                <MapButton label="Whole world" onClick={() => mapRef.current?.move({ kind: "world" })}>
                  <Globe aria-hidden />
                </MapButton>
              </div>
              {/* The replay's month takes the legend's corner while it plays. The legend wraps within the free width, so it never runs under a panel or its tab. In a window under 352 px tall it steps aside: the sliver of map left is the zoom stack's and the credit's. */}
              {replay.window ? (
                <div data-rail-surface="" className="glass absolute z-[5] px-4 py-3" style={{ left: padding.left, bottom: padding.bottom }}>
                  <ReplayCaption range={view.range} window={replay.window} />
                </div>
              ) : (
                <div data-rail-surface="" className="glass absolute z-[5] px-3 py-2 [@media(max-height:22rem)]:hidden" style={{ left: padding.left, bottom: padding.bottom, maxWidth: `calc(100% - ${padding.left + padding.right}px)` }}>
                  <MapLegend ramp={scene.countries.length > 0 ? shading : null} signaling={scene.countries.some((c) => c.signal !== null)} paused={paused} onPausedChange={setPaused} />
                </div>
              )}
            </>
          ) : null}
        </div>

        <SidePanel
          side="right"
          label="Details"
          icon={<Rows3 />}
          titleId={detailsId}
          mode={modeOf("details")}
          width={DETAILS_WIDTH}
          full={compact}
          top={padding.top}
          bottom={compact ? EDGE : padding.bottom}
          onOpen={() => setDrawer("details")}
          onClose={() => setDrawer(null)}
        >
          <h2 id={detailsId} className="sr-only">
            Details
          </h2>
          <DetailsPanel data={data} scene={scene} filters={view.filters} tab={view.tab} onTab={chooseTab} selection={view.selection} onSelect={select} onPoint={setHighlight} replaying={replay.playing} sheet={compact && drawer === "details"} />
        </SidePanel>

        {/* Grown back from its strip, the timeline rises over the map (172 − 64 = 108 px); the camera keeps the strip's framing.
            It goes away while the tour runs, and under a sheet, which would show it through its glass. */}
        <section
          inert={timelineAway}
          aria-labelledby={timelineId}
          data-rail-surface=""
          {...timelinePresence}
          className={cn("glass absolute z-10 flex flex-col overflow-hidden", SLIDE, tucked && grown && "animate-in animation-duration-200 slide-in-from-bottom-[108px] motion-reduce:animate-none")}
          style={{ left: EDGE, right: EDGE, bottom: EDGE, height: grown ? TIMELINE_HEIGHT : TUCKED_TIMELINE_HEIGHT, transform: awayTo("bottom", timelineAway) }}
        >
          <TimelineBar
            className={grown ? undefined : "sr-only"}
            titleId={timelineId}
            fact={`${countOf(scene.list.length, "meeting")} · ${rangeText(scene.window)}`}
            range={view.range}
            onRange={chooseRange}
            narrowed={scene.narrowed && !replay.playing}
            onClear={clearWindow}
            compact={compact}
          >
            {canReplay(range) ? <ReplayButton playing={replay.playing} onStart={replay.start} onPause={pauseReplay} /> : null}
          </TimelineBar>
          <Timeline
            range={range}
            window={scene.window}
            narrowed={scene.narrowed}
            meetings={onTimeline}
            now={data.asOf}
            lastBooked={lastBooked}
            focus={highlight ?? selected}
            nameOf={nameOf}
            onWindow={moveWindow}
            onChoose={chooseMeeting}
            onPoint={setHighlight}
            locked={replay.playing}
          />
        </section>
      </main>

      <Tour tour={tour} countries={byCode} now={data.asOf} onEnd={tour.end} />
    </div>
  );
}

/** The screen, inside `RailSurface`: every surface on it carries `data-rail-surface`, and so does every popup it opens. */
export function ReachScreen(props: ReachScreenProps) {
  return (
    <RailSurface value>
      <Screen {...props} />
    </RailSurface>
  );
}
