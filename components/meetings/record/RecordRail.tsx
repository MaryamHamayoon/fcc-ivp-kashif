import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";
import { DateText } from "@/components/common/DateText";
import { StatusDot } from "@/components/common/StatusBadge";
import { CandidateDates } from "@/components/meetings/CandidateDates";
import { WAITING_ON_LABELS, FORMAT_LABELS } from "@/lib/domain/types";
import type { AgeBand } from "@/lib/domain/waiting-on";
import { formatDateNY, formatRange, relativeAge } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { cn } from "@/lib/utils";
import { Fact, Panel } from "./Panel";

/**
 * The right rail answers the three questions a coordinator opens a record to ask: who owes us
 * something and for how long, what I do next, and the handful of facts I would otherwise have
 * to hunt through tabs for. Everything here is derived — nothing on this rail is typed twice.
 */

const BAND: Record<AgeBand, { ring: string; dot: string; text: string }> = {
  ok: { ring: "border-age-ok/35 bg-card wash-ok", dot: "bg-age-ok", text: "text-age-ok" },
  warn: { ring: "border-age-warn/40 bg-card wash-warn", dot: "bg-age-warn", text: "text-age-warn" },
  alert: { ring: "border-age-alert/45 bg-card wash-alert", dot: "bg-age-alert", text: "text-age-alert" },
};

export function RecordRail({ record, className }: { record: MeetingRecord; className?: string }) {
  const { waiting } = record;
  const activityHref = `${record.href}/activity`;

  return (
    <aside aria-label="Meeting summary" className={cn("flex min-w-0 flex-col gap-4", className)}>
      {waiting ? (
        <Panel
          id="waiting-heading"
          dense
          title="Waiting on"
          action={
            <Link href={`${activityHref}#waiting`} className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Resolve
            </Link>
          }
          className={cn("border", BAND[waiting.band].ring)}
        >
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", BAND[waiting.band].dot)} />
            <span className="min-w-0 truncate">{waiting.label}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className={cn("numeric font-semibold", BAND[waiting.band].text)}>
              {waiting.businessDays} business {waiting.businessDays === 1 ? "day" : "days"}
            </span>{" "}
            since <DateText date={waiting.since} />
            <span className="sr-only"> — we are waiting on {WAITING_ON_LABELS[waiting.who]}</span>
          </p>
          {waiting.nextAction ? (
            <p className="mt-3 border-t pt-3 text-sm">
              <span className="block text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">Next action</span>
              <span className="mt-0.5 flex items-start gap-1.5 text-foreground">
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">{waiting.nextAction}</span>
              </span>
              {waiting.nextActionDueAt ? (
                <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  Due <DateText date={waiting.nextActionDueAt} /> · {relativeAge(waiting.nextActionDueAt, record.now)}
                </span>
              ) : null}
            </p>
          ) : null}
        </Panel>
      ) : (
        <Panel id="waiting-heading" dense title="Waiting on">
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
            <span>Nobody is holding this up. Log an activity when that changes.</span>
          </p>
        </Panel>
      )}

      <Panel id="facts-heading" dense title="Quick facts">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Format">{FORMAT_LABELS[record.format]}</Fact>
          <Fact label="Region">{record.regionName}</Fact>
          <Fact label="When" className="col-span-2">
            {record.scheduledStart ? formatRange(record.scheduledStart, record.scheduledEnd) : <CandidateDates dates={record.candidateDates} />}
          </Fact>
          <Fact label="Requested">
            <DateText date={record.requestedAt} />
          </Fact>
          <Fact label="Lead">{record.leadName ?? "Unassigned"}</Fact>
          {record.requestorName ? (
            <Fact label="Requested by" className="col-span-2">
              <span className="block">{record.requestorName}</span>
              {record.requestor?.title ? <span className="block text-xs text-muted-foreground">{record.requestor.title}</span> : null}
              {record.orgName ? <span className="block text-xs text-muted-foreground">{record.orgName}</span> : null}
              {record.requestor?.email ? (
                <a href={`mailto:${record.requestor.email}`} className="mt-0.5 block truncate text-xs text-primary underline-offset-4 hover:underline">
                  {record.requestor.email}
                </a>
              ) : null}
            </Fact>
          ) : null}
          {record.viaIntermediary ? (
            <Fact label="Via" className="col-span-2">
              {record.viaIntermediary}
            </Fact>
          ) : null}
        </dl>
      </Panel>

      <Panel id="history-heading" dense title={record.orgShortName ? `${record.orgShortName} history` : "Related history"}>
        {record.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">First engagement with this organization.</p>
        ) : (
          <ul className="-mx-1 divide-y divide-border/60">
            {record.history.map((prior) => (
              <li key={prior.id}>
                <Link
                  href={`/meetings/${prior.id}`}
                  className="flex items-start gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <StatusDot status={prior.status} className="mt-1.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{prior.title}</span>
                    <span className="numeric block text-xs text-muted-foreground">
                      {prior.code}
                      {prior.scheduledStart ? ` · ${formatDateNY(prior.scheduledStart, "short")}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </aside>
  );
}
