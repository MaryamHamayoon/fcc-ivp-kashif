"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { Flag } from "@/components/common/Flag";
import { StatusBadge } from "@/components/common/StatusBadge";
import { FormatGlyph } from "@/components/geo/FormatGlyph";
import { countryLabel, type ReachMeeting } from "@/lib/domain/reach";
import { dayDistance } from "@/lib/domain/reach-time";
import { FORMAT_LABELS } from "@/lib/domain/types";
import { countOf, formatDateNY, formatNY } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AGE_TEXT, ReadinessBar } from "./MeetingRow";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 px-4">
      <h4 className="eyebrow">{title}</h4>
      {children}
    </section>
  );
}

/** "Tue, Oct 6, 2026 · 10:00 AM ET" over how far off it is, and whether the date is only proposed. */
function When({ start, proposed, now }: { start: Date | null; proposed: boolean; now: Date }) {
  if (!start) return <span className="text-muted-foreground">Date to be set</span>;
  return (
    <>
      <time dateTime={start.toISOString()} className="block">
        {formatNY(start, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · {formatDateNY(start, "time")} ET
      </time>{" "}
      <span className="block text-muted-foreground">
        {proposed ? "proposed · " : null}
        {dayDistance(start, now)}
      </span>
    </>
  );
}

/**
 * One meeting in the Details panel: its code, countries and organization, status and readiness;
 * when it is, in what format, who leads it and who owes the next move; its FCC experts, what still
 * stands between it and ready, and its topics; and the way on to its record.
 */
export function MeetingView({
  meeting,
  now,
  nameOf,
  titleRef,
}: {
  meeting: ReachMeeting;
  now: Date;
  nameOf: (cca2: string) => string;
  /** The organization's heading, for the panel to move focus to. */
  titleRef?: Ref<HTMLHeadingElement>;
}) {
  const { waiting } = meeting;
  const places = meeting.countries.length > 0 ? meeting.countries.map((cca2) => ({ cca2, name: nameOf(cca2) })) : [{ cca2: "US", name: countryLabel(meeting, nameOf) }];
  const topics = [...new Set(meeting.topics)];

  return (
    <div className="pt-4 pb-5">
      <div className="px-4">
        <p className="numeric text-[0.6875rem] text-muted-foreground">{meeting.code}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {places.map((place) => (
            <li key={place.cca2} className="inline-flex items-center gap-1.5">
              <Flag code={place.cca2} size={11} />
              <span>{place.name}</span>
            </li>
          ))}
        </ul>
        <h3 ref={titleRef} tabIndex={-1} className="heading-display mt-1.5 text-base leading-snug outline-none">
          {meeting.orgName}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={meeting.status} />
          <ReadinessBar percent={meeting.readiness} />
        </div>
      </div>

      <dl className="mx-4 mt-4 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-y py-3 text-xs">
        <dt className="text-muted-foreground">When</dt>
        <dd>
          <When start={meeting.start} proposed={meeting.proposed} now={now} />
        </dd>
        <dt className="text-muted-foreground">Format</dt>
        <dd>
          <span className="inline-flex items-center gap-1.5">
            <FormatGlyph format={meeting.format} size={9} />
            {FORMAT_LABELS[meeting.format]}
          </span>
          {meeting.delegationSize ? <span className="text-muted-foreground"> · delegation of {meeting.delegationSize}</span> : null}
        </dd>
        <dt className="text-muted-foreground">OIA lead</dt>
        <dd>{meeting.lead ?? <span className="text-muted-foreground">Not assigned</span>}</dd>
        <dt className="text-muted-foreground">Waiting on</dt>
        <dd>
          {waiting ? (
            <>
              {waiting.label}{" "}
              <span aria-hidden className={cn("font-medium", AGE_TEXT[waiting.band])}>
                · {waiting.businessDays}d
              </span>
              <span className="sr-only"> for {countOf(waiting.businessDays, "business day")}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Nobody</span>
          )}
        </dd>
      </dl>

      <Section title="FCC experts">
        {meeting.experts.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">None yet</p>
        ) : (
          <ul className="mt-1.5 space-y-1 text-xs">
            {meeting.experts.map((expert, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="font-medium">{expert.name}</span>
                {expert.bureau ? <> <span className="text-muted-foreground">{expert.bureau}</span></> : null}
                {expert.lead ? <> <span className="rounded-sm bg-primary/10 px-1 text-[0.6875rem] font-medium text-primary">lead</span></> : null}
                {expert.confirmed ? null : <> <span className="text-muted-foreground">not yet confirmed</span></>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {meeting.missing.length > 0 ? (
        <Section title="Before it is ready">
          <ul className="mt-1.5 space-y-1.5 text-xs">
            {meeting.missing.map((item) => (
              <li key={item.label}>
                <span className="block font-medium">{item.label}</span>{" "}
                <span className="block text-muted-foreground">{item.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {topics.length > 0 ? (
        <Section title="Topics">
          <ul className="mt-1.5 space-y-1 text-xs">
            {topics.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <p className="mt-4 px-4 text-xs">
        <Link href={`/meetings/${meeting.id}`} className="inline-flex items-center gap-1 rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Open the meeting record
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
