import { notFound } from "next/navigation";
import { ScheduleTab } from "@/components/meetings/record/ScheduleTab";
import { acceptDateAction, declineDateAction, proposeDateAction, updateLogisticsAction } from "../actions";
import { loadMeetingRecord } from "../record";

export const dynamic = "force-dynamic";

/** Schedule — the date negotiation and everything the day needs to work. */
export default async function MeetingSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  return <ScheduleTab record={record} acceptDate={acceptDateAction} declineDate={declineDateAction} proposeDate={proposeDateAction} updateLogistics={updateLogisticsAction} />;
}
