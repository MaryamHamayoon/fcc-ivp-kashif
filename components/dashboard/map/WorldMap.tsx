"use client";

import { ArrowRight, Globe } from "lucide-react";
import Link from "next/link";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { SectionBar } from "@/components/common/SectionBar";
import { CountryTip } from "@/components/geo/CountryTip";
import { MapLegend } from "@/components/geo/MapLegend";
import { NO_WEBGL, ReachMap, type ReachMapHandle, useCanDrawMap } from "@/components/geo/ReachMap";
import { useMapTheme } from "@/components/geo/useMapTheme";
import { useSignalsPaused } from "@/components/geo/useSignalsPaused";
import { type CardCountry, type CardRangeKey, describeCard } from "@/lib/domain/reach";
import { RANGE_LABELS } from "@/lib/domain/reach-time";
import { countOf } from "@/lib/format";
import { boundsOf, type Padding, REGION_PAD } from "@/lib/geo/camera";
import { ramp } from "@/lib/geo/map-palette";
import type { CameraMove } from "@/lib/geo/reach-engine";
import { signalMode } from "@/lib/geo/signals";
import { useReducedMotion } from "@/lib/motion";
import type { CardRegion, ReachCard } from "@/lib/services/dashboard";
import { cn } from "@/lib/utils";
import { MapControls, type MapView, RANGE_WHEN } from "./MapControls";
import { MapCountryPanel } from "./MapCountryPanel";
import { MapList } from "./MapList";

/** The foot row floats over the map's last 32 px: the camera frames the world above it. */
const CARD_PADDING: Padding = { top: 0, right: 0, bottom: 32, left: 0 };

/** Where the camera goes for a region: around its countries with meetings in the range, or around all of them when none has any. */
function regionView(region: string | null, countries: readonly CardCountry[], regions: readonly CardRegion[]): CameraMove {
  if (!region) return { kind: "world" };
  const bounds = boundsOf(countries.filter((c) => c.region === region), REGION_PAD) ?? regions.find((r) => r.name === region)?.bounds;
  return bounds ? { kind: "bounds", bounds } : { kind: "world" };
}

/**
 * The dashboard's Global reach card: the shared map in its preview mode (set, never dragged, so
 * the page always scrolls) or its list twin. The title bar holds the name, how many countries the
 * range counts in the region in view, and the controls. A click on a country opens its panel; the
 * legend runs along the map's foot. Every figure was counted on the server with the full screen's
 * own functions, so the two always agree.
 */
export function WorldMap({ reach, className }: { reach: ReachCard; className?: string }) {
  const theme = useMapTheme();
  const reduce = useReducedMotion();
  const canDraw = useCanDrawMap();
  const [paused, setPaused] = useSignalsPaused();
  const [rangeKey, setRangeKey] = useState<CardRangeKey>("next30");
  const [view, setView] = useState<MapView>("map");
  const [region, setRegion] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const mapRef = useRef<ReachMapHandle>(null);
  const sentenceId = useId();
  const closePanel = useCallback(() => setSelected(null), []);

  const range = rangeKey === "next30" ? reach.next30 : reach.thisYear;
  const { countries } = range;
  const counted = useMemo(() => (region ? countries.filter((c) => c.region === region) : countries), [countries, region]);
  const regionOptions = useMemo(() => reach.regions.map((r) => ({ name: r.name, countries: countries.filter((c) => c.region === r.name).length })), [reach.regions, countries]);
  const shading = useMemo(() => ramp(theme.palette, Math.max(0, ...countries.map((c) => c.count))), [theme.palette, countries]);
  const selectedCountry = countries.find((c) => c.cca2 === selected) ?? null;
  const when = RANGE_WHEN[rangeKey];
  const where = region ? ` in ${region}` : "";
  const showMap = canDraw && view === "map";

  const chooseRegion = (next: string | null) => {
    setRegion(next);
    mapRef.current?.move(regionView(next, countries, reach.regions));
  };
  const chooseRange = (key: CardRangeKey) => {
    const next = key === "next30" ? reach.next30 : reach.thisYear;
    setRangeKey(key);
    setSelected((cca2) => (cca2 && next.countries.some((c) => c.cca2 === cca2) ? cca2 : null));
    if (region) mapRef.current?.move(regionView(region, next.countries, reach.regions));
  };
  const renderTip = (cca2: string) => {
    const c = countries.find((country) => country.cca2 === cca2);
    return c ? <CountryTip country={{ ...c, next: c.next[0] ?? null }} /> : null;
  };

  const list = (note?: string) => <MapList countries={counted} caption={`Countries${where} with meetings ${when}: meetings, participants, formats and the next meeting`} empty={`No meetings${where} ${when}.`} note={note} />;

  return (
    <section aria-labelledby="map-heading" className={cn("relative flex flex-col overflow-hidden rounded-md border bg-card shadow-soft", className)}>
      <SectionBar title="Global reach" titleId="map-heading" icon={<Globe />} note={countOf(counted.length, "country", "countries")}>
        <MapControls range={rangeKey} onRange={chooseRange} view={canDraw ? view : null} onView={setView} regions={regionOptions} worldCount={countries.length} region={region} onRegion={chooseRegion} />
      </SectionBar>

      {/* Its own aspect ratio while the cards stack; beside the upcoming list it takes whatever height the bar leaves. */}
      <div className="relative aspect-[6/5] min-h-[280px] w-full grow basis-auto sm:aspect-[16/10] xl:aspect-auto xl:min-h-0 xl:flex-1">
        {showMap ? (
          <>
            <p id={sentenceId} className="sr-only">
              {describeCard(RANGE_LABELS[rangeKey], range)}
            </p>
            <ReachMap
              ref={mapRef}
              mode="preview"
              theme={theme}
              marks={countries}
              ramp={shading}
              signals={signalMode({ paused, reducedMotion: reduce === true })}
              selected={selected}
              padding={CARD_PADDING}
              view={regionView(region, countries, reach.regions)}
              describedBy={sentenceId}
              renderTip={renderTip}
              onSelect={setSelected}
              fallback={list(NO_WEBGL)}
            />
            {countries.length === 0 ? (
              <p className="pointer-events-none absolute inset-0 z-[1] grid place-items-center px-6 pb-8">
                <span className="rounded-md bg-card/90 px-3 py-1.5 text-sm text-muted-foreground shadow-soft">No meetings {when}</span>
              </p>
            ) : null}
          </>
        ) : (
          list(canDraw ? undefined : NO_WEBGL)
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] flex items-end justify-between gap-4 bg-gradient-to-t from-card via-card/85 to-transparent px-5 pt-5 pb-3">
          {showMap ? <MapLegend ramp={countries.length > 0 ? shading : null} signaling={countries.some((c) => c.signal !== null)} paused={paused} onPausedChange={setPaused} /> : <span />}
          <Link href="/countries" className="pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-sm text-[0.6875rem] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            View all countries
            <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>

        <MapCountryPanel country={showMap ? selectedCountry : null} range={rangeKey} onClose={closePanel} />
      </div>
    </section>
  );
}
