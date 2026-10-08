"use client";

import { formatRange } from "@/lib/format";
import type { MeetingRecord } from "@/lib/services/record";
import { CandidateDatePanel } from "./CandidateDatePanel";
import { LogisticsForm } from "./LogisticsForm";
import { Panel } from "./Panel";
import type { CreateRecordAction, LogisticsRecordAction, RecordAction } from "./tab-actions";

/**
 * Getting the visit into the calendar: which day both sides have agreed to, and everything
 * that has to be true for the day to work. Both halves feed the readiness ring, so this tab
 * is where a stuck meeting is usually unstuck.
 */
export function ScheduleTab({
  record,
  acceptDate,
  declineDate,
  proposeDate,
  updateLogistics,
}: {
  record: MeetingRecord;
  acceptDate: RecordAction;
  declineDate: RecordAction;
  proposeDate: CreateRecordAction;
  updateLogistics: LogisticsRecordAction;
}) {
  const { permissions } = record;

  return (
    <div className="flex flex-col gap-5">
      <Panel
        id="dates-heading"
        eyebrow={record.hasAcceptedDate ? "Locked in" : "Still being agreed"}
        title="Date negotiation"
        action={record.scheduledStart ? <span className="numeric text-xs text-muted-foreground">{formatRange(record.scheduledStart, record.scheduledEnd)}</span> : null}
      >
        <CandidateDatePanel
          meetingId={record.id}
          countryCode={record.primaryCountryCode}
          dates={record.candidateDates}
          canUpdate={permissions.update}
          acceptDate={acceptDate}
          declineDate={declineDate}
          proposeDate={proposeDate}
        />
      </Panel>

      <Panel id="logistics-heading" eyebrow="On the day" title="Logistics">
        <LogisticsForm
          meetingId={record.id}
          format={record.format}
          values={{
            location: record.location,
            virtualLink: record.virtualLink,
            needsAv: record.needsAv,
            interpreter: record.interpreter,
            accommodations: record.accommodations,
            localContact: record.localContact,
          }}
          canUpdate={permissions.update}
          updateLogistics={updateLogistics}
        />
      </Panel>
    </div>
  );
}
