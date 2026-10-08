"use client";

import { type KeyboardEvent, type ReactNode, type Ref, useEffect, useId, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NO_PADDING, type Padding } from "@/lib/geo/camera";
import type { Ramp } from "@/lib/geo/map-palette";
import { type CameraMove, type MapHover, type Place, ReachEngine } from "@/lib/geo/reach-engine";
import type { MapMark, TourFocus } from "@/lib/geo/reach-style";
import { loadShapes } from "@/lib/geo/shapes";
import type { SignalMode } from "@/lib/geo/signals";
import { basemapTiles, basemapUrl, prepareMapLibre } from "@/lib/geo/tiles";
import { webgl2Available } from "@/lib/geo/webgl";
import { reducedMotionNow } from "@/lib/motion";
import { cn } from "@/lib/utils";
import styles from "./reach-map.module.css";
import type { MapTheme } from "./useMapTheme";

export const MAP_LABEL = "World map of the program's meetings";
/** What both surfaces say, above their list, when this browser cannot draw the map. */
export const NO_WEBGL = "This browser can't draw the map. The list shows the same countries.";
/** How long a tooltip waits for the pointer to travel from the mark onto it (WCAG 1.4.13: hoverable). */
export const TIP_GRACE_MS = 150;
/** The tooltip's width (`w-64`), for keeping it inside the map. */
const TIP_WIDTH = 256;
/** Below this much room above the mark, the tooltip opens underneath it. */
const TIP_ROOM = 150;

export type ReachMapHandle = {
  move: (to: CameraMove) => void;
  zoomBy: (delta: 1 | -1) => void;
  /** Where the camera is, as a move back there: the view it was sent, or the spot the reader panned or zoomed to. */
  camera: () => CameraMove;
  /** Puts the keyboard on the map (explore mode), where the arrows pan and + / − zoom. */
  focus: () => void;
};

export type TipPlacement = { cca2: string; left: number; top: number; below: boolean };

/** The tooltip sits beside the mark, never over it: centered above it, or below when the mark is near the top; kept clear of the panels. */
export function tipPlacement(hover: MapHover, width: number, padding: Padding = NO_PADDING): TipPlacement {
  const half = TIP_WIDTH / 2 + 8;
  const low = padding.left + half;
  const high = Math.max(low, width - padding.right - half);
  const below = hover.y - hover.r - padding.top < TIP_ROOM;
  return { cca2: hover.cca2, left: Math.min(Math.max(hover.x, low), high), top: below ? hover.y + hover.r + 10 : hover.y - hover.r - 10, below };
}

export type ReachMapProps = {
  ref?: Ref<ReachMapHandle>;
  /** "preview" on the card (set, never dragged), "explore" on the full screen. Fixed for the map's life. */
  mode: "preview" | "explore";
  theme: MapTheme;
  marks: readonly MapMark[];
  ramp: Ramp;
  signals: SignalMode;
  focus?: TourFocus | null;
  selected?: string | null;
  /** A country lit from outside the map, such as a row the pointer is on. */
  highlight?: string | null;
  /** The part of the map the panels cover; the camera frames into the rest. */
  padding?: Padding;
  places?: readonly Place[];
  /** The first framing, read once. */
  view?: CameraMove;
  label?: string;
  /** The id of the sentence that describes the map. */
  describedBy?: string;
  renderTip: (cca2: string) => ReactNode;
  onSelect: (cca2: string | null) => void;
  /** What shows instead when this browser cannot draw the map. */
  fallback: ReactNode;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
};

const subscribeNothing = () => () => {};

/** Whether this browser can draw the map (WebGL 2): true on the server and at hydration, so the first paint matches. */
export function useCanDrawMap(): boolean {
  return useSyncExternalStore(subscribeNothing, webgl2Available, () => true);
}

/**
 * The map on both surfaces: MapLibre, loaded on demand, driven by `ReachEngine`. Until its own
 * land and marks have drawn it shows a skeleton, then fades in. Where the browser has no WebGL 2
 * it shows the `fallback` (each surface's list). Hovering a country shows `renderTip` beside its
 * mark. The attribution line is ours: it sits at the free area's top right, clear of the legend
 * at its foot, and says when the basemap's details have not arrived.
 */
export function ReachMap(props: ReachMapProps) {
  const { ref, theme, marks, ramp, signals, focus = null, selected = null, highlight = null, padding = NO_PADDING, renderTip, fallback, onKeyDown, className } = props;
  const canDraw = useCanDrawMap();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<ReachEngine | null>(null);
  const latest = useRef(props);
  const pending = useRef<CameraMove | null>(null);
  const onScreen = useRef(true);
  const overTip = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [basemap, setBasemap] = useState(true);
  const [tip, setTip] = useState<TipPlacement | null>(null);
  const tipId = useId();

  useEffect(() => {
    latest.current = props;
  });

  // One engine for the map's life. The latest props are read when MapLibre and the shapes arrive.
  useEffect(() => {
    if (!canDraw) return;
    let cancelled = false;
    const showTip = (hover: MapHover | null) => {
      if (leaving.current) clearTimeout(leaving.current);
      leaving.current = null;
      if (hover) {
        setTip(tipPlacement(hover, host.current?.clientWidth ?? 0, latest.current.padding));
        return;
      }
      leaving.current = setTimeout(() => {
        leaving.current = null;
        if (!overTip.current) setTip(null);
      }, TIP_GRACE_MS);
    };
    Promise.all([import("maplibre-gl"), loadShapes()])
      .then(([lib, shapes]) => {
        if (cancelled || !host.current) return;
        prepareMapLibre(lib);
        const p = latest.current;
        const e = new ReachEngine(lib, host.current, {
          mode: p.mode,
          shapes,
          tiles: basemapTiles(basemapUrl(window.location.origin)),
          theme: p.theme,
          data: { marks: p.marks, ramp: p.ramp, focus: p.focus ?? null },
          places: p.places,
          signals: p.signals,
          padding: p.padding,
          view: pending.current ?? p.view,
          label: p.label ?? MAP_LABEL,
          describedBy: p.describedBy,
          reducedMotion: reducedMotionNow,
          onReady: () => setReady(true),
          onHover: showTip,
          onSelect: (cca2) => latest.current.onSelect(cca2),
          onBasemap: setBasemap,
        });
        e.setSelected(p.selected ?? null);
        e.setHighlight(p.highlight ?? null);
        e.setOnScreen(onScreen.current);
        pending.current = null;
        engine.current = e;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (leaving.current) clearTimeout(leaving.current);
      engine.current?.destroy();
      engine.current = null;
    };
  }, [canDraw]);

  useEffect(() => engine.current?.setTheme(theme), [theme]);
  useEffect(() => engine.current?.setData({ marks, ramp, focus }), [marks, ramp, focus]);
  useEffect(() => engine.current?.setSelected(selected), [selected]);
  useEffect(() => engine.current?.setHighlight(highlight), [highlight]);
  useEffect(() => engine.current?.setSignalMode(signals), [signals]);
  useEffect(() => engine.current?.setPadding(padding), [padding]);

  // The rings run only while the map is on screen.
  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      onScreen.current = entry?.isIntersecting ?? true;
      engine.current?.setOnScreen(onScreen.current);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canDraw]);

  // Escape closes the tooltip (WCAG 1.4.13: dismissible).
  useEffect(() => {
    if (!tip) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setTip(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tip]);

  useImperativeHandle(
    ref,
    () => ({
      move: (to) => {
        if (engine.current) engine.current.move(to);
        else pending.current = to;
      },
      zoomBy: (delta) => engine.current?.zoomBy(delta),
      camera: () => engine.current?.camera() ?? pending.current ?? latest.current.view ?? { kind: "world" },
      focus: () => engine.current?.map.getCanvas().focus(),
    }),
    [],
  );

  if (!canDraw || failed) return <>{fallback}</>;

  return (
    <div className={cn("absolute inset-0", className)} onKeyDown={onKeyDown}>
      <div ref={host} className={cn(styles.host, "absolute inset-0 overflow-hidden transition-opacity duration-[400ms] ease-out", ready ? "opacity-100" : "opacity-0")} />

      {ready ? null : (
        <div className="absolute inset-0 p-6" aria-busy="true">
          <Skeleton className="h-full w-full rounded-md" />
          <span className="sr-only">Loading the map…</span>
        </div>
      )}

      {tip ? (
        <div
          role="tooltip"
          id={tipId}
          data-rail-surface={props.mode === "explore" ? "" : undefined}
          style={{ left: tip.left, top: tip.top, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})` }}
          className="absolute z-10 w-64 max-w-[80%] rounded-md border bg-popover/95 px-3 py-2 text-popover-foreground shadow-lift backdrop-blur"
          onMouseEnter={() => {
            overTip.current = true;
          }}
          onMouseLeave={() => {
            overTip.current = false;
            setTip(null);
          }}
        >
          {renderTip(tip.cca2)}
        </div>
      ) : null}

      <p className="absolute z-[1] rounded-sm bg-card/90 px-1.5 py-0.5 text-[0.625rem] leading-none text-muted-foreground" style={{ top: padding.top + 6, right: padding.right + 8 }}>
        {basemap ? null : <span>Map details unavailable · </span>}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline focus-visible:underline">
          © OpenStreetMap
        </a>
        {" · "}
        <a href="https://www.naturalearthdata.com" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline focus-visible:underline">
          Natural Earth
        </a>
      </p>
    </div>
  );
}
