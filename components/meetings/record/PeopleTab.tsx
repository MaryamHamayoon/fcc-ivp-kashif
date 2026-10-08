"use client";

import type { MeetingRecord } from "@/lib/services/record";
import { AddExpertDialog, type BureauOption } from "./AddExpertDialog";
import { AddParticipantDialog } from "./AddParticipantDialog";
import { ExpertsByBureau } from "./ExpertsByBureau";
import { Panel } from "./Panel";
import { ParticipantsTable, ParticipantTotalsEditor } from "./ParticipantsTable";
import type { AddressBookAction, CreateRecordAction, RecordAction } from "./tab-actions";

/**
 * Everyone the meeting depends on, in the order a coordinator worries about them: the FCC
 * briefers who have to say yes, the delegation roster the visitors owe us, and the headcounts
 * the annual report will ask for months from now.
 */
export function PeopleTab({
  record,
  bureaus,
  addExpert,
  requestExpert,
  respondExpert,
  removeExpert,
  searchAddressBook,
  addParticipant,
  removeParticipant,
  setParticipantTotals,
}: {
  record: MeetingRecord;
  bureaus: BureauOption[];
  addExpert: CreateRecordAction;
  requestExpert: RecordAction;
  respondExpert: RecordAction;
  removeExpert: RecordAction;
  searchAddressBook: AddressBookAction;
  addParticipant: CreateRecordAction;
  removeParticipant: RecordAction;
  setParticipantTotals: RecordAction;
}) {
  const { permissions } = record;
  const confirmed = record.experts.filter((e) => e.status === "confirmed").length;
  const pending = record.counts.expertsPending;
  const showActual = record.status === "completed" || record.status === "closed";

  return (
    <div className="flex flex-col gap-5">
      <Panel
        id="experts-heading"
        eyebrow={pending > 0 ? `${pending} still to answer` : confirmed > 0 ? "All briefers confirmed" : "Nobody asked yet"}
        title="FCC briefers"
        action={
          permissions.update ? (
            <AddExpertDialog
              meetingId={record.id}
              assignedStaffIds={record.experts.map((e) => e.staffId)}
              bureaus={bureaus}
              addExpert={addExpert}
              searchAddressBook={searchAddressBook}
            />
          ) : null
        }
      >
        <ExpertsByBureau
          meetingId={record.id}
          experts={record.experts}
          now={record.now}
          canUpdate={permissions.update}
          canRespond={permissions.respondAsExpert}
          requestExpert={requestExpert}
          respondExpert={respondExpert}
          removeExpert={removeExpert}
        />
      </Panel>

      <Panel
        id="roster-heading"
        eyebrow="Who is coming"
        title="Delegation and guests"
        action={permissions.update ? <AddParticipantDialog meetingId={record.id} addParticipant={addParticipant} /> : null}
      >
        <ParticipantsTable meetingId={record.id} participants={record.participants} canUpdate={permissions.update} removeParticipant={removeParticipant} />
      </Panel>

      <Panel id="headcounts-heading" eyebrow={showActual ? "For the annual report" : "Expected numbers"} title="Headcounts">
        <ParticipantTotalsEditor
          meetingId={record.id}
          totals={record.participantTotals}
          showActual={showActual}
          canUpdate={permissions.update}
          setParticipantTotals={setParticipantTotals}
        />
      </Panel>
    </div>
  );
}
