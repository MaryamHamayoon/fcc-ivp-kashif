import { notFound } from "next/navigation";
import { toActivityEntries } from "@/components/meetings/record/activity-entries";
import { ActivityTab } from "@/components/meetings/record/ActivityTab";
import { loadMeetingRecord } from "../record";
import { logActivityAction, resolveActivityAction } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Activity — the record's own history, and the one place it is written. The layout has
 * already loaded (and memoized) this record; the tab flattens its activities for the client
 * island that composes, filters and resolves them.
 */
export default async function MeetingActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  return (
    <ActivityTab
      meetingId={record.id}
      entries={toActivityEntries(record)}
      waitingActivityId={record.waiting?.activityId ?? null}
      canLog={record.permissions.logActivity}
      now={record.now}
      log={logActivityAction}
      resolve={resolveActivityAction}
    />
  );
}
