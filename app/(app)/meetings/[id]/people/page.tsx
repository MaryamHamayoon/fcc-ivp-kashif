import { notFound } from "next/navigation";
import { PeopleTab } from "@/components/meetings/record/PeopleTab";
import { getDb } from "@/lib/db/client";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { addExpertAction, addParticipantAction, removeExpertAction, removeParticipantAction, requestExpertAction, respondExpertAction, searchAddressBookAction, setParticipantTotalsAction } from "../actions";
import { loadMeetingRecord } from "../record";

export const dynamic = "force-dynamic";

/**
 * People — the FCC briefers, the delegation roster and the headcounts. The record is already
 * loaded (and memoized) by the layout; only the bureau list for the address-book filter is new.
 */
export default async function MeetingPeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  const bureaus = await makeReferenceRepo(await getDb()).bureaus();

  return (
    <PeopleTab
      record={record}
      bureaus={bureaus.map((bureau) => ({ code: bureau.code, name: bureau.name }))}
      addExpert={addExpertAction}
      requestExpert={requestExpertAction}
      respondExpert={respondExpertAction}
      removeExpert={removeExpertAction}
      searchAddressBook={searchAddressBookAction}
      addParticipant={addParticipantAction}
      removeParticipant={removeParticipantAction}
      setParticipantTotals={setParticipantTotalsAction}
    />
  );
}
