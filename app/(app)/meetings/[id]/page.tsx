import { notFound } from "next/navigation";
import { OverviewTab } from "@/components/meetings/record/OverviewTab";
import { loadMeetingRecord } from "./record";

export const dynamic = "force-dynamic";

/** Overview — the tab a record opens on. The layout has already loaded (and memoized) this record. */
export default async function MeetingOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  return <OverviewTab record={record} />;
}
