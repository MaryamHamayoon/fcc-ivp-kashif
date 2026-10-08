import { CalendarCheck, CalendarClock, CalendarX2, Languages, MapPin, Monitor, Video } from "lucide-react";
import { Flag } from "@/components/common/Flag";
import type { CandidateDateRow } from "@/lib/db/types";
import { type CandidateDateStatus, FORMAT_LABELS } from "@/lib/domain/types";
import { formatDateNY, formatRange } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { LifecycleStepper } from "./LifecycleStepper";
import { Fact, Panel } from "./Panel";
import { ParticipantsSummary } from "./ParticipantsSummary";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { TopicsList } from "./TopicsList";

/**
 * Everything a backup coordinator needs to run this meeting without asking anyone: why it was
 * requested, what the delegation wants to talk about, which date is real, what is still
 * missing, how many people to expect, and where the record sits in its lifecycle.
 */
export function OverviewTab({ record }: { record: MeetingRecord }) {
  const interpreter = record.interpreter === "none" ? null : record.interpreter === "consecutive" ? "Consecutive" : "Simultaneous";
  const showActual = record.status === "completed" || record.status === "closed";

  return (
    <div className="flex flex-col gap-5">
      <LifecycleStepper status={record.status} previousStatus={record.previousStatus} holdReason={record.holdReason} holdFollowUpAt={record.holdFollowUpAt} cancelReason={record.cancelReason} />

      <Panel id="details-heading" eyebrow="The request" title="Meeting details">
        {record.purpose ? <p className="mb-5 max-w-prose text-sm leading-relaxed text-foreground">{record.purpose}</p> : null}

        <dl className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
          <Fact label="Format">
            <span className="flex items-center gap-1.5">
              {record.format === "virtual" ? <Video className="size-3.5 text-muted-foreground" aria-hidden /> : record.format === "hybrid" ? <Monitor className="size-3.5 text-muted-foreground" aria-hidden /> : <MapPin className="size-3.5 text-muted-foreground" aria-hidden />}
              {FORMAT_LABELS[record.format]}
            </span>
          </Fact>
          <Fact label="Delegation">{record.delegationSize === null ? "Size not stated" : `${record.delegationSize} visitors`}</Fact>
          <Fact label="Countries">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {record.countries.map((country) => (
                <span key={country.cca2} className="inline-flex items-center gap-1.5">
                  <Flag code={country.cca2} size={11} />
                  {country.name}
                </span>
              ))}
            </span>
          </Fact>
          <Fact label={record.format === "virtual" ? "Platform" : "Location"} className="col-span-2 sm:col-span-1">
            {record.format === "virtual" ? (record.virtualLink ? "Virtual link on file" : <span className="text-warn">No link yet</span>) : (record.location ?? <span className="text-warn">No room yet</span>)}
          </Fact>
          <Fact label="Interpretation">
            {interpreter ? (
              <span className="flex items-center gap-1.5">
                <Languages className="size-3.5 text-muted-foreground" aria-hidden />
                {interpreter}
              </span>
            ) : (
              "None requested"
            )}
          </Fact>
          <Fact label="A/V">{record.needsAv ? "Requested" : "Not requested"}</Fact>
          {record.localContact ? (
            <Fact label="Local contact" className="col-span-2 sm:col-span-3">
              {record.localContact}
            </Fact>
          ) : null}
          {record.accommodations ? (
            <Fact label="Accommodations" className="col-span-2 sm:col-span-3">
              {record.accommodations}
            </Fact>
          ) : null}
        </dl>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <TopicsList topics={record.topics} />
        <ReadinessChecklist readiness={record.readiness} />
        <DatesPanel record={record} />
        <ParticipantsSummary totals={record.participantTotals} showActual={showActual} />
      </div>
    </div>
  );
}

type DateTone = { icon: typeof CalendarCheck; label: string; box: string; mark: string; dead: boolean };

const DATE_TONE: Record<CandidateDateStatus, DateTone> = {
  accepted: { icon: CalendarCheck, label: "Accepted", box: "border-ok/40 bg-ok/8", mark: "text-ok", dead: false },
  proposed: { icon: CalendarClock, label: "Proposed", box: "border-border bg-muted/40", mark: "text-muted-foreground", dead: false },
  declined: { icon: CalendarX2, label: "Declined", box: "border-border", mark: "text-muted-foreground", dead: true },
  withdrawn: { icon: CalendarX2, label: "Withdrawn", box: "border-border", mark: "text-muted-foreground", dead: true },
};

/** The date negotiation, in order, with who put each option on the table. */
function DatesPanel({ record }: { record: MeetingRecord }) {
  const dates: CandidateDateRow[] = [...record.candidateDates].sort((a, b) => a.start.getTime() - b.start.getTime());

  return (
    <Panel
      id="dates-heading"
      eyebrow={record.hasAcceptedDate ? "Locked in" : "Still being agreed"}
      title="Dates"
      action={
        record.scheduledStart ? (
          <span className="numeric text-xs text-muted-foreground">{formatDateNY(record.scheduledStart, "weekday")}</span>
        ) : null
      }
    >
      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No candidate dates yet — propose one from the Schedule tab.</p>
      ) : (
        <ul className="space-y-2">
          {dates.map((date) => {
            const tone = DATE_TONE[date.status];
            const Icon = tone.icon;
            return (
              <li key={date.id} className={cn("flex items-start gap-3 rounded-2xl border px-3 py-2.5", tone.box)}>
                <Icon className={cn("mt-0.5 size-4 shrink-0", tone.mark)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm font-medium", tone.dead ? "text-muted-foreground line-through" : "text-foreground")}>{formatRange(date.start, date.end)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tone.label} · proposed by {date.proposedBy === "fcc" ? "the FCC" : "the delegation"}
                    {date.note ? ` · ${date.note}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
