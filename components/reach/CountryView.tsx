"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";
import { Flag } from "@/components/common/Flag";
import { FormatBreakdown } from "@/components/geo/FormatGlyph";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type ReachBureau, tallies } from "@/lib/domain/reach";
import { formatDateNY, formatNumber } from "@/lib/format";
import { nextOf, type ScreenCountry } from "@/lib/reach/scene";
import { NO_COUNTRIES } from "./CountryList";
import { MeetingRow } from "./MeetingRow";

const LINK = "rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Figure({ term, value, note }: { term: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-muted-foreground">{term}</dt>
      <dd className="numeric mt-0.5 text-lg leading-tight font-semibold">
        {value}
        {note ? <span className="block font-sans text-[0.6875rem] font-normal text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  );
}

/** A code with its full name on hover and focus, and in its accessible name, code first: "WTB, Wireless Telecommunications Bureau". */
function BureauLink({ code, name }: { code: string; name: string | undefined }) {
  const href = `/directory?bureauCode=${encodeURIComponent(code)}`;
  if (!name) {
    return (
      <Link href={href} className={LINK}>
        {code}
      </Link>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger render={<Link href={href} aria-label={`${code}, ${name}`} className={LINK} />}>{code}</TooltipTrigger>
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  );
}

/**
 * One country in the Details panel: flag, name, region and formats; its figures for the window
 * (meetings, participants, and the next meeting, or the last when nothing is ahead); the topics
 * its visits raised and the FCC bureaus and offices that met them, each a way into the Directory;
 * its meetings in the window as rows; and the way on to its dossier.
 */
export function CountryView({
  country,
  bureaus,
  now,
  nameOf,
  onChoose,
  onPoint,
  titleRef,
}: {
  country: ScreenCountry;
  bureaus: readonly ReachBureau[];
  now: Date;
  nameOf: (cca2: string) => string;
  onChoose: (id: string) => void;
  onPoint: (cca2: string | null) => void;
  /** The name's heading, for the panel to move focus to. */
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const next = nextOf(country, now);
  const last = next ? null : (country.meetings.at(-1) ?? null);
  const shown = next ?? last;
  const topics = tallies(country.meetings, (m) => m.topics);
  const codes = tallies(country.meetings, (m) => m.bureaus).map((t) => t.key);
  const names = new Map(bureaus.map((b) => [b.code, b.name]));

  return (
    <div className="pt-4 pb-5">
      <div className="flex items-start gap-3 px-4">
        <Flag code={country.cca2} size={20} className="mt-0.5" />
        <div className="min-w-0">
          <h3 ref={titleRef} tabIndex={-1} className="heading-display text-base leading-snug outline-none">
            {country.name}
          </h3>
          <p className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">{country.region}</p>
          {country.count > 0 ? <FormatBreakdown mix={country.mix} className="mt-1.5 text-xs text-muted-foreground" /> : null}
        </div>
      </div>

      <dl className="mx-4 mt-4 grid grid-cols-3 gap-3 border-b pb-4">
        <Figure term="Meetings" value={formatNumber(country.count)} />
        <Figure term="Participants" value={formatNumber(country.participants)} />
        <Figure term={last ? "Last" : "Next"} value={shown?.start ? formatDateNY(shown.start, "monthday") : "—"} note={shown?.proposed ? "proposed" : undefined} />
      </dl>

      {topics.length > 0 ? (
        <section className="mt-4 px-4">
          <h4 className="eyebrow">Topics raised</h4>
          <ul className="mt-1.5 space-y-1 text-xs">
            {topics.map((t) => (
              <li key={t.key} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">{t.key}</span>{" "}
                <span className="numeric text-muted-foreground">
                  {t.count}
                  <span className="sr-only"> {t.count === 1 ? "meeting" : "meetings"}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {codes.length > 0 ? (
        <section className="mt-4 px-4">
          <h4 className="eyebrow">FCC bureaus and offices</h4>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {codes.map((code) => (
              <li key={code}>
                <BureauLink code={code} name={names.get(code)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-4">
        <h4 className="eyebrow px-4">In this window</h4>
        {country.meetings.length === 0 ? (
          <p className="px-4 pt-1.5 text-sm text-muted-foreground">{NO_COUNTRIES}</p>
        ) : (
          <ol className="mt-1.5 divide-y border-y">
            {country.meetings.map((m) => (
              <li key={m.id}>
                <MeetingRow meeting={m} nameOf={nameOf} onChoose={onChoose} onPoint={onPoint} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-4 px-4 text-xs">
        <Link href={`/countries/${country.cca2}`} className={`inline-flex items-center gap-1 ${LINK}`}>
          Open {country.name}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
