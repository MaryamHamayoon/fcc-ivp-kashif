"use client";

import { ArrowRight, Maximize, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Flag } from "@/components/common/Flag";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormatBreakdown, FormatGlyph } from "@/components/geo/FormatGlyph";
import type { CardCountry, CardMeeting, CardRangeKey } from "@/lib/domain/reach";
import { RANGE_LABELS } from "@/lib/domain/reach-time";
import { FORMAT_LABELS } from "@/lib/domain/types";
import { countOf, formatDateNY } from "@/lib/format";
import { motionTransition, useReducedMotion } from "@/lib/motion";
import { RANGE_WHEN, reachHref } from "./MapControls";

function when(m: CardMeeting): string {
  if (!m.start) return "Date to be set";
  const day = formatDateNY(m.start);
  return m.proposed ? `${day} (proposed)` : day;
}

/**
 * Slides in over the map with one country's share of the range: meetings and participants, the
 * formats, and the next three meetings, each a link to its record. From here the reader goes on
 * to the full screen, opened on this country, or to the country's own page.
 */
export function MapCountryPanel({ country, range, onClose }: { country: CardCountry | null; range: CardRangeKey; onClose: () => void }) {
  const reduce = useReducedMotion();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (country) headingRef.current?.focus({ preventScroll: true });
  }, [country]);

  // Escape closes the panel, unless the map's tooltip, which sits above it, has already taken the key.
  useEffect(() => {
    if (!country) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [country, onClose]);

  return (
    <AnimatePresence>
      {country ? (
        <motion.aside
          key={country.cca2}
          aria-labelledby="map-country-heading"
          initial={reduce ? false : { x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={reduce ? undefined : { x: 24, opacity: 0 }}
          transition={motionTransition({ type: "spring", bounce: 0, duration: 0.35 })}
          className="absolute top-4 right-4 z-20 flex max-h-[calc(100%-2rem)] w-80 max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-md border bg-card/95 shadow-lift backdrop-blur"
        >
          <header className="flex items-start gap-3 border-b px-4 py-3">
            <Flag code={country.cca2} size={22} className="mt-1" />
            <div className="min-w-0 flex-1">
              <h3 id="map-country-heading" ref={headingRef} tabIndex={-1} className="heading-display text-lg leading-tight outline-none">
                {country.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                {country.region} · {RANGE_LABELS[range]}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close country details" className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-4" aria-hidden />
            </button>
          </header>

          <div className="border-b px-4 py-2.5">
            <p className="text-sm">
              {countOf(country.count, "meeting")} <span className="text-muted-foreground">·</span> {countOf(country.participants, "participant")}
            </p>
            <FormatBreakdown mix={country.mix} className="mt-1.5 text-xs text-muted-foreground" />
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
            <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Coming up</h4>
            {country.next.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing more {RANGE_WHEN[range]}.</p>
            ) : (
              <ul className="mt-1 divide-y">
                {country.next.map((m) => (
                  <li key={m.id}>
                    <Link href={`/meetings/${m.id}`} className="flex items-center gap-3 py-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <FormatGlyph format={m.format} size={10} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{m.orgName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {when(m)} · {FORMAT_LABELS[m.format]}
                        </span>
                      </span>
                      <StatusBadge status={m.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <footer className="flex items-center justify-between gap-2 border-t px-4 py-3 text-xs">
            <Link href={reachHref({ range, country: country.cca2 })} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
              <Maximize className="size-3" aria-hidden />
              Open in full screen
            </Link>
            <Link href={`/countries/${country.cca2}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Open {country.name}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </footer>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
