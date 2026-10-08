import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { RecordHeader } from "@/components/meetings/record/RecordHeader";
import { RecordRail } from "@/components/meetings/record/RecordRail";
import { RecordTabs } from "@/components/meetings/record/RecordTabs";
import { resumeAction, transitionAction } from "../actions";
import { loadMeetingRecord } from "./record";

export const dynamic = "force-dynamic";

/**
 * The frame every tab of a meeting record shares: masthead, section tabs and the summary rail.
 * The record itself is loaded once per request (React `cache`) and read again by each tab page,
 * so the layout and its child never disagree and never query twice.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  return { title: record ? `${record.code} · ${record.title}` : "Meeting" };
}

export default async function MeetingRecordLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();
  // An IVP code in the URL resolves, then settles on the canonical id.
  if (record.id !== id) redirect(record.href);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <RecordHeader record={record} transition={transitionAction} resume={resumeAction} />

      <RecordTabs basePath={record.href} counts={{ people: record.counts.experts, documents: record.counts.documents, activity: record.counts.openWaiting }} />

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:gap-8">
        <div className="min-w-0">{children}</div>
        <RecordRail record={record} className="lg:sticky lg:top-6" />
      </div>
    </div>
  );
}
