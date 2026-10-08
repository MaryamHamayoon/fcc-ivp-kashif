"use client";

import { type BrushBehavior, brushX, type D3BrushEvent } from "d3-brush";
import { select, type Selection } from "d3-selection";
import { type FocusEvent, Fragment, type KeyboardEvent, type PointerEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useChartDims } from "@/components/charts/useChartDims";
import { Flag } from "@/components/common/Flag";
import { StatusDot } from "@/components/common/StatusBadge";
import { FormatGlyph } from "@/components/geo/FormatGlyph";
import { TIP_GRACE_MS } from "@/components/geo/ReachMap";
import { countryLabel, meetingName, type ReachMeeting } from "@/lib/domain/reach";
import { addNyDays, dayGrain, nyDayNumber, type Span, spanDays } from "@/lib/domain/reach-time";
import { FORMAT_LABELS, type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { formatDateNY } from "@/lib/format";
import { useRailSurface } from "@/lib/rail-surface";
import { CHIP_HEIGHT, type Fade, fadeOf, lastDay, markOpacity, markTip, ROW_HEIGHT, rowName, snapWindow, stepWindow, timelineLayout, type TimelineScale, type WindowEdge } from "@/lib/reach/timeline";
import { cn } from "@/lib/utils";
import styles from "./timeline.module.css";

export type TimelineProps = {
  /** The range's whole span: the timeline always draws all of it. */
  range: Span;
  /** The window in force: the range itself when nothing is narrowed. */
  window: Span;
  narrowed: boolean;
  /** The range's meetings through the filters, as `timelineMeetings` orders them. */
  meetings: readonly ReachMeeting[];
  now: Date;
  /** The program's last dated meeting, whatever the filters. */
  lastBooked: Date | null;
  /** The country lit anywhere on the screen, or else the selected one: every meeting without it dims. */
  focus: string | null;
  nameOf: (cca2: string) => string;
  /** A drag or a key moves the window (`live` while a drag is still moving); null gives the whole range back. */
  onWindow: (window: Span | null, options: { live: boolean }) => void;
  /** A mark, chip or row was chosen. */
  onChoose: (meeting: ReachMeeting) => void;
  /** Pointing at (or focusing) a meeting lights its first country on the map; null when it leaves. */
  onPoint: (cca2: string | null) => void;
  /** While Replay runs, the window is Replay's: the brush cannot be dragged and the sliders are aria-disabled and ignore keys. */
  locked?: boolean;
  className?: string;
};

/** How wide the brush's handles are, and the window sliders laid over them, centered on the window's edges. */
const HANDLE = 12;
/** The tooltip sits this far above what it describes, and keeps this far inside the viewport. */
const TIP_GAP = 8;
const TIP_MARGIN = 8;
/** Fading and hovering change only opacity and color, over 160 ms; the app's reduced-motion rule takes even that away. */
const FADE = "transition-[opacity,color,background-color,border-color] duration-[160ms]";
const RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
/** "+3" in the day view and "+3 more" in the agenda: a quiet brand-colored button that opens its day. */
const MORE = cn("pointer-events-auto absolute h-[15px] rounded-[3px] px-[5px] text-[11px] leading-[15px] font-semibold whitespace-nowrap text-primary hover:bg-primary/10", FADE, RING);

/**
 * How wide a chip must be to hold its flag (17 px), the gap (4 px) and its format glyph (8 px)
 * inside its 1 px border, with a pixel to spare each side. A narrower chip, in a long day range on
 * a small screen, shows its flag alone; its name and its tooltip still say the format.
 */
const CHIP_GLYPH_ROOM = 33;

/** Tailwind needs literal class names, so each status's chip border, at 75% strength, is spelled out. */
const CHIP_BORDER: Record<MeetingStatus, string> = {
  requested: "border-status-requested/75",
  developing: "border-status-developing/75",
  clearance: "border-status-clearance/75",
  confirmed: "border-status-confirmed/75",
  completed: "border-status-completed/75",
  closed: "border-status-closed/75",
  on_hold: "border-status-on-hold/75",
  cancelled: "border-status-cancelled/75",
};

/** A status's color as paint, for the SVG marks and the agenda's dots: `on_hold` reads `--status-on-hold`. */
const statusColor = (status: MeetingStatus): string => `var(--status-${status.replace("_", "-")})`;

const sameSpan = (a: Span, b: Span): boolean => a.from.getTime() === b.from.getTime() && a.to.getTime() === b.to.getTime();

/** A window as the screen keeps it: the whole range is no window at all, so it comes back as null. */
const asWindow = (next: Span | null, range: Span): Span | null => (next && !sameSpan(next, range) ? next : null);

const dayWindow = (day: Date): Span => ({ from: day, to: addNyDays(day, 1) });

/** The window a brush selection covers, from its two edges in pixels. */
const windowAt = (scale: TimelineScale, [x0, x1]: readonly [number, number]): Span => ({ from: scale.invert(x0), to: scale.invert(x1) });

/** The flag a meeting shows: its first country's, or the United States' for a visit with no foreign country. */
const flagOf = (m: ReachMeeting): string => m.countries[0] ?? "US";

/** What opens a chip's or row's tooltip: the pointer, and focus (WCAG 1.4.13). */
type TipTriggers = {
  onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
};

/**
 * A meeting's mark in the weeks and compact views, its format told by shape before color as the
 * map tells it: in person a disc, hybrid a ring around a core, virtual an open ring, all in the
 * status color. A transparent disc a little wider takes the pointer. Marks answer the pointer only:
 * the Details panel lists every meeting for the keyboard and for screen readers.
 */
function Mark({ meeting, cx, cy, size, opacity, onEnter, onLeave, onChoose }: { meeting: ReachMeeting; cx: number; cy: number; size: number; opacity: number; onEnter: (event: PointerEvent<SVGGElement>) => void; onLeave: (event: PointerEvent<SVGGElement>) => void; onChoose: () => void }) {
  const r = size / 2;
  const color = statusColor(meeting.status);
  const lit = "group-hover:stroke-foreground group-hover:[stroke-width:1.5px]";
  return (
    <g data-meeting={meeting.id} transform={`translate(${cx},${cy})`} style={{ opacity }} className="group cursor-pointer transition-opacity duration-[160ms]" onPointerEnter={onEnter} onPointerLeave={onLeave} onClick={onChoose}>
      <circle r={r + 1.5} fill="transparent" />
      {meeting.format === "in_person" ? <circle r={r} fill={color} className={lit} /> : <circle r={r - 0.7} fill="var(--card)" stroke={color} strokeWidth={1.4} className={lit} />}
      {meeting.format === "hybrid" ? <circle r={Math.max(1.2, r * 0.4)} fill={color} /> : null}
    </g>
  );
}

/**
 * A meeting in the day view: the first country's flag and the format glyph on a card, bordered in
 * the status color, dashed while the date is only proposed. Its name says the whole meeting.
 * Outside the window it fades like a mark; focus brings it back to full strength so its ring shows.
 */
function Chip({ meeting, left, top, width, fade, name, tip, onChoose }: { meeting: ReachMeeting; left: number; top: number; width: number; fade: Fade; name: string; tip: TipTriggers; onChoose: () => void }) {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={onChoose}
      {...tip}
      style={{ left, top, width, height: CHIP_HEIGHT, opacity: fade === "in" ? 1 : markOpacity(meeting, fade) }}
      className={cn(
        "pointer-events-auto absolute flex items-center justify-center gap-1 overflow-hidden rounded-[3px] border bg-card px-[3px] hover:border-foreground focus-visible:opacity-100!",
        CHIP_BORDER[meeting.status],
        meeting.proposed && "border-dashed",
        FADE,
        RING,
      )}
    >
      <Flag code={flagOf(meeting)} size={11} />
      {width >= CHIP_GLYPH_ROOM ? <FormatGlyph format={meeting.format} size={8} /> : null}
    </button>
  );
}

/**
 * A meeting in the agenda: its status dot (a hollow ring while the date is only proposed), the time
 * in Washington, the flag, the country and the format glyph. Faded, its text turns muted, never
 * fainter, and its dot, flag and glyph drop to a quarter strength.
 */
function AgendaRow({ meeting, left, top, width, faded, nameOf, tip, onChoose }: { meeting: ReachMeeting; left: number; top: number; width: number; faded: boolean; nameOf: (cca2: string) => string; tip: TipTriggers; onChoose: () => void }) {
  const color = statusColor(meeting.status);
  const quiet = cn("transition-opacity duration-[160ms]", faded && "opacity-25");
  return (
    <button
      type="button"
      aria-label={rowName(meeting, nameOf)}
      onClick={onChoose}
      {...tip}
      style={{ left, top, width, height: ROW_HEIGHT }}
      className={cn("pointer-events-auto absolute flex items-center gap-1.5 rounded-[3px] px-[5px] text-left text-[11px] leading-[15px] hover:bg-primary/10", faded ? "text-muted-foreground" : "text-foreground", FADE, RING)}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", quiet)} style={meeting.proposed ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { backgroundColor: color }} />
      <span className="numeric w-[52px] shrink-0 text-[10.5px] text-muted-foreground">{meeting.start ? formatDateNY(meeting.start, "time") : null}</span>
      <Flag code={flagOf(meeting)} size={11} className={quiet} />
      <span className="min-w-0 flex-1 truncate font-semibold">{countryLabel(meeting, nameOf)}</span>
      <FormatGlyph format={meeting.format} size={9} className={quiet} />
    </button>
  );
}

/**
 * One edge of the window, for the keyboard: a slider over the brush's handle, valued in days from
 * the range's first. The pointer passes through it to the handle beneath, which does the dragging.
 * Its grip shows while the window is narrowed, and otherwise only while the slider has focus.
 */
function WindowSlider({ edge, x, top, base, value, max, day, narrowed, locked, onKeyDown }: { edge: WindowEdge; x: number; top: number; base: number; value: number; max: number; day: Date; narrowed: boolean; locked: boolean; onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void }) {
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={edge === "from" ? "Window start" : "Window end"}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={formatDateNY(day, "short")}
      aria-disabled={locked ? true : undefined}
      onKeyDown={onKeyDown}
      style={{ left: x - HANDLE / 2, top, width: HANDLE, height: base - top }}
      className={cn("group/grip pointer-events-none absolute z-[1] flex items-center justify-center rounded-[3px]", RING)}
    >
      <span aria-hidden className={cn("h-[18px] w-1 rounded-full bg-primary transition-opacity duration-[160ms]", narrowed ? "opacity-100" : "opacity-0 group-focus/grip:opacity-100")} />
    </div>
  );
}

/** The tooltip's three lines: countries and date, beside the flag; organization and time; format and status, each with its mark. */
function TipLines({ meeting, nameOf }: { meeting: ReachMeeting; nameOf: (cca2: string) => string }) {
  const [heading, detail] = markTip(meeting, nameOf);
  return (
    <>
      <p className="flex items-start gap-1.5 font-semibold">
        <Flag code={flagOf(meeting)} size={11} className="mt-[2.5px]" />
        <span className="min-w-0">{heading}</span>
      </p>
      <p className="mt-0.5 text-muted-foreground">{detail}</p>
      <p className="mt-1 flex items-center gap-1.5">
        <FormatGlyph format={meeting.format} size={9} />
        <span>{FORMAT_LABELS[meeting.format]}</span>
        <span className="text-muted-foreground">·</span>
        <StatusDot status={meeting.status} />
        <span>{STATUS_LABELS[meeting.status]}</span>
      </p>
    </>
  );
}

/**
 * The timeline at the foot of the full screen: the whole range at its own grain (a
 * mark per meeting stacked by week, a chip per meeting a day at a time, or an agenda of rows), with
 * the window the reader has narrowed inside it. Dragging across it narrows the window, with the
 * screen following while the drag moves; a click without a drag gives the whole range back; day
 * views snap to whole days when the drag ends. From the keyboard the window is two sliders. Every
 * meeting outside the window fades, and every meeting without the country lit elsewhere dims.
 *
 * An SVG draws the quiet structure, the axis, the marks and d3-brush's drag window; an HTML layer
 * above it holds everything a reader can reach by keyboard, as real, named buttons. Pointing at (or
 * focusing) a meeting shows one tooltip, portaled out of the panel, which clips, and lights the
 * meeting's country on the map.
 */
export function Timeline({ range, window: windowSpan, narrowed, meetings, now, lastBooked, focus, nameOf, onWindow, onChoose, onPoint, locked = false, className }: TimelineProps) {
  const { ref, width, height } = useChartDims();
  const rail = useRailSurface();

  // The drawing follows the range's dates, not its identity: the screen derives a fresh range with
  // every window, and a drag must only restyle the timeline, never lay it out again.
  const rangeFrom = range.from.getTime();
  const rangeTo = range.to.getTime();
  const nowAt = now.getTime();
  const lastAt = lastBooked?.getTime() ?? null;
  const layout = useMemo(
    () => timelineLayout({ span: { from: new Date(rangeFrom), to: new Date(rangeTo) }, width, height, meetings, now: new Date(nowAt), lastBooked: lastAt === null ? null : new Date(lastAt) }),
    [rangeFrom, rangeTo, width, height, meetings, nowAt, lastAt],
  );

  // What the brush's events and the tooltip's timer read when they fire, rather than close over.
  const latest = useRef({ layout, range, onWindow, onPoint });
  useEffect(() => {
    latest.current = { layout, range, onWindow, onPoint };
  });

  /* ---------------------------------- brush --------------------------------- */

  const brushNode = useRef<SVGGElement>(null);
  const brushing = useRef<{ brush: BrushBehavior<unknown>; group: Selection<SVGGElement, unknown, null, undefined> } | null>(null);
  const dragging = useRef(false);
  const drawn = layout !== null;
  const { left, right, top, base } = layout ?? { left: 0, right: 0, top: 0, base: 0 };

  // One brush per strip: made again only when the strip itself moves, never while a drag runs.
  useEffect(() => {
    const node = brushNode.current;
    if (!drawn || !node) return;
    const group = select(node);
    const brush = brushX<unknown>()
      .extent([
        [left, top],
        [right, base],
      ])
      .handleSize(HANDLE);
    brush.on("start brush end", (event: D3BrushEvent<unknown>) => {
      // The moves made here, keeping the brush on the window, carry no source event.
      if (!event.sourceEvent) return;
      const { layout: current, range: span, onWindow: report } = latest.current;
      if (!current) return;
      if (event.type === "start") {
        dragging.current = true;
        return;
      }
      const selection = event.selection as [number, number] | null;
      if (event.type === "brush") {
        if (selection && selection[1] > selection[0]) report(asWindow(windowAt(current.scale, selection), span), { live: true });
        return;
      }
      dragging.current = false;
      if (!selection) {
        // A click without a drag gives the whole range back.
        report(null, { live: false });
        return;
      }
      let final = windowAt(current.scale, selection);
      if (dayGrain(span)) {
        final = snapWindow(final, span);
        brush.move(group, [current.scale.x(final.from), current.scale.x(final.to)]);
      }
      report(asWindow(final, span), { live: false });
    });
    group.call(brush);
    brushing.current = { brush, group };
    return () => {
      brushing.current = null;
      group.on(".brush", null).selectAll("*").remove();
      Reflect.deleteProperty(node, "__brush");
    };
  }, [drawn, left, top, right, base]);

  // The brush follows the window it is given (Clear selection, a new range, a day button, Replay),
  // except while the reader is dragging it.
  const x0 = layout && narrowed ? layout.scale.x(windowSpan.from) : null;
  const x1 = layout && narrowed ? layout.scale.x(windowSpan.to) : null;
  useEffect(() => {
    const brushed = brushing.current;
    if (!brushed || dragging.current) return;
    brushed.brush.move(brushed.group, x0 === null || x1 === null ? null : [x0, x1]);
  }, [x0, x1, drawn, left, top, right, base]);

  /* --------------------------------- tooltip -------------------------------- */

  const [tip, setTip] = useState<{ meeting: ReachMeeting; anchor: Element } | null>(null);
  const tipBox = useRef<HTMLDivElement>(null);
  const tipAnchor = useRef<Element | null>(null);
  const grace = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const hideTip = useCallback(() => {
    clearTimeout(grace.current);
    if (!tipAnchor.current) return;
    tipAnchor.current = null;
    setTip(null);
    latest.current.onPoint(null);
  }, []);
  const showTip = useCallback((meeting: ReachMeeting, anchor: Element) => {
    clearTimeout(grace.current);
    if (tipAnchor.current === anchor) return;
    tipAnchor.current = anchor;
    setTip({ meeting, anchor });
    latest.current.onPoint(meeting.countries[0] ?? null);
  }, []);
  // Leaving what the tooltip describes gives the pointer a moment to reach the tooltip (WCAG 1.4.13: hoverable).
  const leaveTip = useCallback(
    (anchor: Element) => {
      if (tipAnchor.current !== anchor) return;
      clearTimeout(grace.current);
      grace.current = setTimeout(hideTip, TIP_GRACE_MS);
    },
    [hideTip],
  );
  const blurTip = useCallback(
    (anchor: Element) => {
      if (tipAnchor.current === anchor) hideTip();
    },
    [hideTip],
  );
  const holdTip = useCallback(() => clearTimeout(grace.current), []);

  // Escape closes the tooltip (WCAG 1.4.13: dismissible), ahead of the screen's own Escape, which skips a prevented event.
  const open = tip !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      hideTip();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, hideTip]);

  // Going away takes the timer with it, and the country the tooltip had lit.
  useEffect(() => hideTip, [hideTip]);

  // 8 px above what it describes and centered on it, kept inside the viewport: placed before paint, once its size is known.
  useLayoutEffect(() => {
    const box = tipBox.current;
    if (!tip || !box) return;
    const anchor = tip.anchor.getBoundingClientRect();
    const own = box.getBoundingClientRect();
    const centered = anchor.left + anchor.width / 2 - own.width / 2;
    box.style.left = `${Math.max(TIP_MARGIN, Math.min(centered, globalThis.innerWidth - TIP_MARGIN - own.width))}px`;
    box.style.top = `${Math.max(TIP_MARGIN, anchor.top - TIP_GAP - own.height)}px`;
  }, [tip]);

  const tipOn = (meeting: ReachMeeting): TipTriggers => ({
    onPointerEnter: (event) => showTip(meeting, event.currentTarget),
    onPointerLeave: (event) => leaveTip(event.currentTarget),
    onFocus: (event) => showTip(meeting, event.currentTarget),
    onBlur: (event) => blurTip(event.currentTarget),
  });

  /* ---------------------------------- window -------------------------------- */

  const openDay = (day: Date) => onWindow(asWindow(dayWindow(day), range), { live: false });
  const stepKey = (edge: WindowEdge) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked) return;
    const next = stepWindow(windowSpan, edge, event.key, range, dayGrain(range));
    if (!next) return;
    event.preventDefault();
    onWindow(asWindow(next, range), { live: false });
  };
  const firstDay = nyDayNumber(range.from);
  const endDay = lastDay(windowSpan);

  const agenda = layout?.view === "agenda";
  const compact = layout?.view === "compact";

  return (
    <div ref={ref} className={cn("relative min-h-0 flex-1", className)}>
      {layout ? (
        <>
          <svg aria-hidden="true" focusable="false" className="absolute inset-0 block size-full">
            {layout.bands.map((band, i) => (
              <rect key={i} x={band.x} y={agenda ? 0 : top} width={band.width} height={agenda ? base : base - top} className={band.kind === "today" ? "fill-primary/10" : "fill-foreground/5"} />
            ))}
            {layout.years.map((year) => (
              <text key={year.label} x={year.x} y={top + 11} className="fill-muted-foreground text-[10px] font-semibold tracking-[0.06em]">
                {year.label}
              </text>
            ))}
            {layout.dividers.map((x) => (
              <line key={x} x1={x} x2={x} y1={0} y2={base} className="stroke-border" />
            ))}
            {layout.ticks.length > 0 ? (
              <g shapeRendering="crispEdges">
                <line x1={left} x2={right} y1={base + 0.5} y2={base + 0.5} className="stroke-border" />
                {layout.ticks.map((tick, i) => (
                  <g key={i}>
                    <line x1={tick.x} x2={tick.x} y1={base} y2={base + 4} className="stroke-border" />
                    {tick.label ? (
                      <text x={tick.labelX} y={base + (compact ? 13 : 15)} textAnchor={tick.anchor} className={cn("text-[10.5px] font-medium", tick.today ? "fill-primary font-bold" : "fill-muted-foreground")}>
                        {tick.label}
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            ) : null}
            <g ref={brushNode} className={cn(styles.brush, locked && styles.locked)} />
            {layout.marks.map(({ meeting, cx, cy }) => (
              <Mark
                key={meeting.id}
                meeting={meeting}
                cx={cx}
                cy={cy}
                size={layout.markSize}
                opacity={markOpacity(meeting, fadeOf(meeting, windowSpan, focus))}
                onEnter={(event) => showTip(meeting, event.currentTarget)}
                onLeave={(event) => leaveTip(event.currentTarget)}
                onChoose={() => onChoose(meeting)}
              />
            ))}
            {layout.today ? (
              <g className="pointer-events-none">
                <line x1={layout.today.x} x2={layout.today.x} y1={top} y2={base} strokeWidth={1.5} className="stroke-primary" />
                <text x={layout.today.flip ? layout.today.x + 5 : layout.today.x - 5} y={top + (compact ? 9 : 11)} textAnchor={layout.today.flip ? "start" : "end"} className="fill-primary text-[10.5px] font-bold">
                  Today
                </text>
              </g>
            ) : null}
            {layout.note ? (
              <text x={layout.note.x} y={layout.note.y + 4} textAnchor="middle" className="pointer-events-none fill-muted-foreground text-[11.5px] italic">
                {layout.note.text}
              </text>
            ) : null}
          </svg>

          <div className="pointer-events-none absolute inset-0">
            <WindowSlider edge="from" x={layout.scale.x(windowSpan.from)} top={top} base={base} value={nyDayNumber(windowSpan.from) - firstDay} max={spanDays(range) - 1} day={windowSpan.from} narrowed={narrowed} locked={locked} onKeyDown={stepKey("from")} />
            <WindowSlider edge="to" x={layout.scale.x(windowSpan.to)} top={top} base={base} value={nyDayNumber(endDay) - firstDay} max={spanDays(range) - 1} day={endDay} narrowed={narrowed} locked={locked} onKeyDown={stepKey("to")} />

            {/* Chips and each day's "+3" in reading order: day by day, the "+3" after its day's chips. */}
            {[
              ...layout.chips.map((chip) => ({
                left: chip.left,
                node: (
                  <Chip
                    key={chip.meeting.id}
                    meeting={chip.meeting}
                    left={chip.left}
                    top={chip.top}
                    width={chip.width}
                    fade={fadeOf(chip.meeting, windowSpan, focus)}
                    name={meetingName(chip.meeting, nameOf)}
                    tip={tipOn(chip.meeting)}
                    onChoose={() => onChoose(chip.meeting)}
                  />
                ),
              })),
              ...layout.more.map((more) => ({
                left: more.left,
                node: (
                  <button key={`more-${more.day.getTime()}`} type="button" aria-label={`+${more.count} more on ${formatDateNY(more.day, "short")}`} onClick={() => openDay(more.day)} style={{ left: more.left, top: more.top, width: more.width }} className={cn(MORE, "text-center")}>
                    +{more.count}
                  </button>
                ),
              })),
            ]
              .sort((a, b) => a.left - b.left)
              .map((item) => item.node)}

            {layout.days.map((day) => {
              const pressed = narrowed && sameSpan(windowSpan, dayWindow(day.day));
              return (
                <Fragment key={day.day.getTime()}>
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => (pressed ? onWindow(null, { live: false }) : openDay(day.day))}
                    style={{ left: day.left, maxWidth: day.width }}
                    className={cn(
                      "pointer-events-auto absolute top-0.5 block h-4 truncate rounded-[3px] px-[5px] text-[11px] leading-4 font-semibold",
                      pressed ? "bg-primary/10 text-primary" : day.today ? "text-primary" : "text-muted-foreground hover:text-foreground",
                      FADE,
                      RING,
                    )}
                  >
                    {day.label}
                  </button>
                  {day.rows.map((row) => (
                    <AgendaRow
                      key={row.meeting.id}
                      meeting={row.meeting}
                      left={day.left}
                      top={row.top}
                      width={day.width}
                      faded={fadeOf(row.meeting, windowSpan, focus) !== "in"}
                      nameOf={nameOf}
                      tip={tipOn(row.meeting)}
                      onChoose={() => onChoose(row.meeting)}
                    />
                  ))}
                  {day.more ? (
                    <button type="button" aria-label={`+${day.more.count} more on ${formatDateNY(day.day, "short")}`} onClick={() => openDay(day.day)} style={{ left: day.left, top: day.more.top }} className={MORE}>
                      +{day.more.count} more
                    </button>
                  ) : null}
                  {day.rows.length === 0 && day.more === null ? (
                    <span className="absolute truncate text-[11px] leading-[15px] text-muted-foreground italic" style={{ left: day.left + 5, top: top + 2, maxWidth: day.width - 10 }}>
                      Nothing scheduled
                    </span>
                  ) : null}
                </Fragment>
              );
            })}
          </div>
        </>
      ) : null}

      {tip
        ? createPortal(
            // Every chip and row already says all of this in its name, and a mark is a pointer's shortcut to the Details list.
            <div ref={tipBox} aria-hidden="true" {...rail} onPointerEnter={holdTip} onPointerLeave={hideTip} className="glass fixed top-0 left-0 z-50 w-max max-w-[260px] px-2.5 py-2 text-xs leading-4">
              <TipLines meeting={tip.meeting} nameOf={nameOf} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
