"use client";

import { ChevronDown, ChevronUp, Gauge } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/motion";
import { useId, useState, useSyncExternalStore } from "react";
import { SectionBar } from "@/components/common/SectionBar";
import { fiscalMonthIndex, fiscalYearOf } from "@/lib/domain/fiscal-year";
import { fyLabel, type GlanceTense, glanceHeadline } from "@/lib/domain/glance";
import type { DashboardData } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";
import { BandStat } from "./BandStat";

/* ------------------------------ collapsed? ------------------------------- */
// The same shape as the map's motion switch: a module-level cache notifies every
// subscriber synchronously on write, so the band responds in this tab (native
// "storage" events never fire here) without ever calling setState from an effect.
// The server snapshot is always "expanded", so hydration matches the markup.

const BAND_KEY = "ivp.band";
const listeners = new Set<() => void>();
let bandOpen = true;
let bandLoaded = false;

function readBand(): boolean {
  try {
    return window.localStorage.getItem(BAND_KEY) !== "collapsed";
  } catch {
    return true; // private mode, or storage blocked by policy
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onBandStorage(event: StorageEvent) {
  if (event.key !== BAND_KEY) return;
  bandLoaded = false;
  notify();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) window.addEventListener("storage", onBandStorage);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onBandStorage);
  };
}

function snapshot(): boolean {
  if (!bandLoaded) {
    bandOpen = readBand();
    bandLoaded = true;
  }
  return bandOpen;
}

function setBandOpen(next: boolean) {
  bandOpen = next;
  bandLoaded = true;
  try {
    window.localStorage.setItem(BAND_KEY, next ? "expanded" : "collapsed");
  } catch {
    // the preference simply will not survive the session
  }
  notify();
}

/** Whether the figures under the headline are showing; the choice is remembered per browser. */
function useBandOpen(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

/* ------------------------------ the band --------------------------------- */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The one saturated surface on the dashboard. It opens with the same slim title bar as every
 * other section, in the band's own ink: its name, the fiscal year, and the collapse control.
 * Under it, the year in a sentence, with the four figures that sentence is built from.
 * Collapsing leaves the sentence — an executive who only wants the headline keeps it, and
 * everyone else keeps the arithmetic.
 */
export function ProgramBand({ kpis, fiscalYear, asOf, scoped, className }: { kpis: DashboardData["kpis"]; fiscalYear: number; asOf: Date; scoped: boolean; className?: string }) {
  const headingId = useId();
  const panelId = `${headingId}-figures`;
  const reduce = useReducedMotion() ?? false;
  const open = useBandOpen();
  const [touched, setTouched] = useState(false);

  const currentFy = fiscalYearOf(asOf);
  const tense: GlanceTense = fiscalYear === currentFy ? "current" : fiscalYear < currentFy ? "past" : "future";
  const monthsToDate = tense === "current" ? fiscalMonthIndex(asOf) + 1 : tense === "past" ? 12 : 0;
  const when = tense === "current" ? "this fiscal year" : `in ${fyLabel(fiscalYear)}`;
  const priorLabel = fyLabel(fiscalYear - 1);

  const headline = glanceHeadline({
    engagements: kpis.meetingsFy.value,
    countries: kpis.countriesFy.value,
    participants: kpis.participantsFy.value,
    fiscalYear,
    tense,
    scoped,
  });

  const stats = [
    {
      id: "engagements",
      value: kpis.meetingsFy.value,
      unit: plural(kpis.meetingsFy.value, "engagement", "engagements"),
      prior: kpis.meetingsFy.prior,
      priorLabel,
      note: `Counted meetings with a date ${when}`,
      series: kpis.meetingsFy.series.slice(0, monthsToDate),
      seriesLabel: "Engagements by fiscal month",
    },
    {
      id: "countries",
      value: kpis.countriesFy.value,
      unit: plural(kpis.countriesFy.value, "country", "countries"),
      prior: kpis.countriesFy.prior,
      priorLabel,
      note: "Distinct countries; a multi-country meeting counts once for each",
      series: kpis.countriesFy.series.slice(0, monthsToDate),
      seriesLabel: "Countries engaged by fiscal month",
    },
    {
      id: "participants",
      value: kpis.participantsFy.value,
      unit: plural(kpis.participantsFy.value, "participant", "participants"),
      prior: kpis.participantsFy.prior,
      priorLabel,
      note: "Foreign officials across those meetings",
      series: kpis.participantsFy.series.slice(0, monthsToDate),
      seriesLabel: "Participants by fiscal month",
    },
    {
      id: "upcoming",
      value: kpis.upcoming30.value,
      unit: "in the next 30 days",
      prior: null,
      priorLabel,
      note: "Developing, in clearance or confirmed",
      series: kpis.upcoming30.series,
      seriesLabel: "Scheduled meetings over the next 12 weeks",
    },
  ];

  // Whether the figures rise into place. The markup must not depend on the motion preference —
  // the server cannot know it, and a reader with reduced motion would otherwise hydrate a
  // different tree — so the preference only shortens the transition, inside BandStat.
  const stagger = !touched;
  const toggle = () => {
    setTouched(true);
    setBandOpen(!open);
  };

  return (
    <section aria-labelledby={headingId} className={cn("band-surface overflow-hidden rounded-md shadow-lift", className)}>
      <SectionBar tone="band" title={scoped ? "Your briefings" : "Program at a glance"} titleId={headingId} icon={<Gauge />} note={fyLabel(fiscalYear)}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-band-muted transition-colors hover:bg-band-surface hover:text-band-foreground focus-visible:outline-white"
        >
          {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          <span className="sr-only">{open ? "Collapse the program summary" : "Expand the program summary"}</span>
        </button>
      </SectionBar>

      <div className="px-5 pt-4 pb-5">
        <p className="heading-display max-w-[64ch] text-[1.375rem] leading-snug text-band-foreground md:text-[1.5rem]">{headline}</p>

        {/* `initial` is left alone on AnimatePresence: setting it to false there would also
            suppress the sub-cards' entrance through the presence context. The panel opts out of
            its own first-mount animation instead, so the page loads with the figures already in
            place and only the stagger below plays. */}
        <AnimatePresence>
          {open ? (
            <motion.div
              key="figures"
              id={panelId}
              className="overflow-hidden"
              initial={touched ? { height: 0, opacity: 0 } : false}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map((stat, i) => (
                  <BandStat key={stat.id} {...stat} index={i} stagger={stagger} />
                ))}
              </ul>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </section>
  );
}
