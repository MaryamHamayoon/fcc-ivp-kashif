"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { type ReactNode, type Ref, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { Flag } from "@/components/common/Flag";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormatBreakdown, FormatGlyph } from "@/components/geo/FormatGlyph";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ReachCountry, type ReachMeeting, TOUR_DAYS, tourSummary, travelText } from "@/lib/domain/reach";
import { dayDistance } from "@/lib/domain/reach-time";
import { FORMAT_LABELS } from "@/lib/domain/types";
import { countOf, formatNY } from "@/lib/format";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { EDGE, TOUR_CARD_BOTTOM } from "@/lib/reach/layout";
import { cn } from "@/lib/utils";
import { AGE_TEXT, ReadinessBar } from "./MeetingRow";
import { STOP_MS, type TourControls } from "./useTour";

const EASE = [0.22, 1, 0.36, 1] as const;
/**
 * How long after the card appears its first visit is spoken. A live region is heard only when it
 * changes after it exists, so the line that says which visit this is joins it a moment later.
 */
const ANNOUNCE_AFTER_MS = 250;

/** Why the Tour button does nothing: its tooltip and its description. */
export const NOTHING_TO_TOUR = `Nothing to tour in the next ${TOUR_DAYS} days`;
/** What the tour offers: the Tour button's tooltip, and the Tour item in the strip's menu under 768 px. */
export const tourLabel = (count: number): string => (count === 0 ? NOTHING_TO_TOUR : `Tour ${countOf(count, "visit")} in the next ${TOUR_DAYS} days`);

/** A button that is aria-disabled: dimmed and still focusable, with no hover wash promising an action. */
const DIMMED = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const DIMMED_OUTLINE = `${DIMMED} aria-disabled:hover:bg-background dark:aria-disabled:hover:bg-input/30`;

/** Keys typed into a field belong to the field. */
const typing = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;

/** Space presses a focused control, here as anywhere; it pauses the tour only from elsewhere, such as the map. */
const pressable = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('button, a[href], summary, [role="button"], [role="link"]') !== null;

type TourProps = {
  tour: TourControls;
  countries: ReadonlyMap<string, ReachCountry>;
  /** The program's clock, for "in 12 days". */
  now: Date;
  onEnd: () => void;
};

/**
 * The tour's own chrome while it runs: a pill at the top with the program's name, the
 * keys and End tour, and a caption card at the foot that tells one visit at a time (when, who,
 * where it stands, how they come) and then sums the tour up. The caption is a polite live region,
 * so each visit is heard as it arrives. While the tour runs, ← and → move, Space pauses and Escape
 * ends it, from anywhere but a text field, and those keys go no further, so the map does not pan
 * under them; a focused button keeps Space, which presses it. Renders nothing while no tour runs;
 * hiding the page's own chrome, moving the camera and handing focus back to the Tour button are
 * the screen's.
 */
export function Tour({ tour, countries, now, onEnd }: TourProps) {
  if (!tour.active) return null;
  return <RunningTour tour={tour} countries={countries} now={now} onEnd={onEnd} />;
}

/** Mounted once per tour, so its focus, keys and first announcement start fresh each time. */
function RunningTour({ tour, countries, now, onEnd }: TourProps) {
  const reduce = useReducedMotion();
  const { stops, index, paused } = tour;
  const summary = index >= stops.length;
  const meeting = summary ? null : stops[index];
  const pauseRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  /** The control in the card that last had focus, to notice when it is taken away. */
  const lastFocused = useRef<HTMLElement | null>(null);
  const [heard, setHeard] = useState(false);

  // Into the card as the tour opens, so the keyboard is where the tour is.
  useEffect(() => {
    pauseRef.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => setHeard(true), ANNOUNCE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  // Between the last visit and the summary the controls change. When the one with focus goes,
  // focus moves to the control that took its place, rather than falling to the page.
  useEffect(() => {
    const was = lastFocused.current;
    if (!was || was.isConnected) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    (summary ? doneRef : pauseRef).current?.focus({ preventScroll: true });
  }, [summary]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return;
    if (e.key === "Escape") onEnd();
    else if (e.key === "ArrowLeft") {
      if (!e.repeat) tour.previous();
    } else if (e.key === "ArrowRight") {
      if (!e.repeat) tour.next();
    } else if (e.key === " " && !summary && !pressable(e.target)) {
      if (!e.repeat) tour.togglePause();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  });
  useEffect(() => {
    const listen = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listen, true);
    return () => window.removeEventListener("keydown", listen, true);
  }, []);

  const arrive = (offset: number) => ({
    initial: reduce === true ? false : { y: offset, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    transition: motionTransition({ duration: 0.42, ease: EASE }),
  });

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3" style={{ top: EDGE }}>
        <motion.div data-rail-surface="" className="glass pointer-events-auto flex max-w-full min-w-0 items-center gap-2.5 py-2 pr-2 pl-3.5 whitespace-nowrap" {...arrive(-12)}>
          <Image src="/brand/fcc-seal.svg" alt="" width={22} height={22} className="size-[22px] shrink-0" />
          <span className="truncate text-sm font-semibold">International Visitors Program</span>
          <span className="text-xs text-muted-foreground max-sm:hidden">The next {TOUR_DAYS} days</span>
          <span aria-hidden className="h-4 w-px shrink-0 bg-border max-md:hidden" />
          <span aria-hidden className="inline-flex items-center gap-1 text-xs text-muted-foreground max-md:hidden">
            <Kbd>←</Kbd>
            <Kbd>→</Kbd>
            <span className="me-1.5">move</span>
            <Kbd>Space</Kbd>
            pause
          </span>
          <span className="sr-only">Left and right arrow keys move between visits, Space pauses, Escape ends the tour.</span>
          <Button variant="outline" size="sm" aria-keyshortcuts="Escape" onClick={onEnd} className="ms-1">
            End tour
          </Button>
        </motion.div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-6" style={{ bottom: TOUR_CARD_BOTTOM }}>
        <motion.section
          aria-label="Tour"
          data-rail-surface=""
          className="glass pointer-events-auto relative w-full max-w-[800px] overflow-hidden"
          onFocus={(e) => {
            lastFocused.current = e.target;
          }}
          {...arrive(24)}
        >
          <div className="grid grid-cols-1 items-center gap-x-[18px] gap-y-3 px-[18px] py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div aria-live="polite" aria-atomic="true" className="min-w-0">
              <span className="sr-only">{heard && !summary ? `Visit ${index + 1} of ${stops.length}.` : null}</span>
              <motion.div
                key={index}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 sm:gap-x-[18px]"
                initial={reduce === true ? false : { y: 6, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={motionTransition({ duration: 0.28, ease: EASE })}
              >
                {meeting ? <StopCaption meeting={meeting} countries={countries} now={now} /> : <SummaryCaption stops={stops} />}
              </motion.div>
            </div>

            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
              {summary ? null : <Dots count={stops.length} current={index} />}
              <div className="ms-auto flex items-center gap-1.5 sm:ms-0">
                <CardButton label="Previous visit" keys="ArrowLeft" disabled={index === 0} onClick={tour.previous}>
                  <ChevronLeft aria-hidden />
                </CardButton>
                {summary ? (
                  <Button ref={doneRef} onClick={onEnd} className="px-4">
                    Done
                  </Button>
                ) : (
                  <>
                    <Button
                      ref={pauseRef}
                      variant="outline"
                      size="icon"
                      aria-label="Pause the tour"
                      aria-pressed={paused}
                      aria-keyshortcuts="Space"
                      onClick={tour.togglePause}
                      className="aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-primary"
                    >
                      {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                    </Button>
                    <CardButton label="Next visit" keys="ArrowRight" onClick={tour.next}>
                      <ChevronRight aria-hidden />
                    </CardButton>
                  </>
                )}
              </div>
              {summary ? null : (
                <span aria-hidden className="numeric text-[0.6875rem] text-muted-foreground max-sm:order-first">
                  {index + 1} of {stops.length}
                </span>
              )}
            </div>
          </div>

          {/* The visit's time running out: the line fills over the stop, holds while paused, and is left out when motion is reduced. */}
          {summary || reduce === true ? null : (
            <span
              key={index}
              aria-hidden
              data-progress=""
              className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-primary"
              style={{ animationName: "grow-x", animationDuration: `${STOP_MS}ms`, animationTimingFunction: "linear", animationFillMode: "both", animationPlayState: paused ? "paused" : "running" }}
            />
          )}
        </motion.section>
      </div>
    </>
  );
}

/** One visit, as the caption tells it. */
function StopCaption({ meeting: m, countries, now }: { meeting: ReachMeeting; countries: ReadonlyMap<string, ReachCountry>; now: Date }) {
  const [code] = m.countries;
  const home = code ? countries.get(code) : undefined;
  const names = m.countries.map((c) => countries.get(c)?.name ?? c).join(", ");
  const travel = home ? travelText(m, home) : { label: m.format === "virtual" ? "By video" : FORMAT_LABELS[m.format], detail: null };
  const when = m.start ? dayDistance(m.start, now) : "date to be set";
  const lead = m.lead ? `OIA lead ${m.lead}` : "OIA lead to be named";
  return (
    <>
      {m.start ? (
        <DateBlock
          label={formatNY(m.start, { weekday: "long", month: "long", day: "numeric" })}
          top={formatNY(m.start, { weekday: "short" })}
          day={formatNY(m.start, { day: "numeric" })}
          bottom={formatNY(m.start, { month: "short" })}
        />
      ) : (
        <DateBlock label="Date to be set" top="" day="—" bottom="" />
      )}
      <div className="min-w-0">
        <h2 className="heading-display flex items-center gap-2.5 text-xl leading-tight">
          {code ? <Flag code={code} size={20} /> : null}
          <span className="min-w-0 text-pretty">{names}</span>
        </h2>
        <p className="mt-0.5 text-[0.8125rem] text-pretty">{m.orgName}</p>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={m.status} />
          <ReadinessBar percent={m.readiness} />
          {m.waiting ? <WaitingText waiting={m.waiting} /> : null}
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <FormatGlyph format={m.format} size={12} className="mt-0.5" />
          <span>
            <span className="font-semibold text-foreground">{travel.label}</span>
            {`${travel.detail ? ` · ${travel.detail}` : ""} · ${when}${m.proposed ? " (proposed)" : ""} · ${lead}`}
          </span>
        </p>
      </div>
    </>
  );
}

/** The tour in sum: how many visits from how many countries, how they come, and where they stand. */
function SummaryCaption({ stops }: { stops: readonly ReachMeeting[] }) {
  const s = tourSummary(stops);
  return (
    <>
      <DateBlock top="Next" day={String(TOUR_DAYS)} bottom="days" />
      <div className="min-w-0">
        <h2 className="heading-display text-xl leading-tight">
          {countOf(s.visits, "visit")} from {countOf(s.countries, "country", "countries")}
        </h2>
        <FormatBreakdown mix={s.mix} className="mt-2 text-[0.8125rem]" />
        <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{`${s.confirmed} confirmed · ${s.waiting} waiting on someone · ${s.ready} at least 80% ready`}</p>
      </div>
    </>
  );
}

/** A date as a stub: the weekday, the day large, the month. With `label`, a screen reader hears that instead of the three pieces. */
function DateBlock({ top, day, bottom, label }: { top: string; day: string; bottom: string; label?: string }) {
  const small = "text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase";
  return (
    <p className="w-16 border-r pr-3.5 text-center sm:w-[92px]">
      {label ? <span className="sr-only">{label}</span> : null}
      <span aria-hidden={label ? true : undefined} className="flex flex-col items-center">
        <span className={small}>{top}</span>
        <span className="numeric text-[2.125rem] leading-[1.05] font-medium tracking-[-0.03em]">{day}</span>
        <span className={small}>{bottom}</span>
      </span>
    </p>
  );
}

/** "Waiting on FCC expert · 6d" in its age color; a screen reader hears the days in full. */
function WaitingText({ waiting }: { waiting: NonNullable<ReachMeeting["waiting"]> }) {
  return (
    <span className={cn("text-xs font-semibold", AGE_TEXT[waiting.band])}>
      Waiting on {waiting.label}
      <span aria-hidden> · {waiting.businessDays}d</span>
      <span className="sr-only">, {countOf(waiting.businessDays, "business day")}</span>
    </span>
  );
}

/** Where the tour is, as a row of dots: behind, here (wider), ahead. Decorative; "3 of 12" and the caption say it in words. */
function Dots({ count, current }: { count: number; current: number }) {
  return (
    <span aria-hidden className="flex items-center gap-1 max-sm:hidden">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={cn("h-1.5 rounded-full transition-colors duration-300", i === current ? "w-[18px] bg-primary" : i < current ? "w-1.5 bg-primary/35" : "w-1.5 bg-foreground/15")} />
      ))}
    </span>
  );
}

/** An icon-only control on the card: named, with the name as its tooltip, and the key that does the same. */
function CardButton({ label, keys, disabled = false, onClick, children }: { label: string; keys: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="outline" size="icon" aria-label={label} aria-keyshortcuts={keys} disabled={disabled} focusableWhenDisabled onClick={onClick} className={DIMMED_OUTLINE} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border bg-muted px-1 py-px font-mono text-[0.625rem] leading-[1.4] text-muted-foreground">{children}</kbd>;
}

/**
 * The strip's control for the tour. The strip slides away while a tour runs, so the button only
 * ever starts one. With nothing to tour it stays focusable but does nothing, and says why in its
 * tooltip and in its description. `ref` reaches the button, for giving focus back when a tour ends.
 */
export function TourButton({ count, onStart, ref }: { count: number; onStart: () => void; ref?: Ref<HTMLButtonElement> }) {
  const reasonId = useId();
  const empty = count === 0;
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              ref={ref}
              variant="ghost"
              disabled={empty}
              focusableWhenDisabled
              aria-describedby={empty ? reasonId : undefined}
              onClick={onStart}
              className={`${DIMMED} aria-disabled:hover:bg-transparent`}
            />
          }
        >
          <Play aria-hidden />
          Tour
        </TooltipTrigger>
        <TooltipContent side="bottom">{tourLabel(count)}</TooltipContent>
      </Tooltip>
      {empty ? (
        <span id={reasonId} className="sr-only">
          {NOTHING_TO_TOUR}
        </span>
      ) : null}
    </>
  );
}
