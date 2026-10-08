import { notFound } from "next/navigation";
import { DocumentsTab } from "@/components/meetings/record/DocumentsTab";
import { addDocumentAction, removeDocumentAction, reuseDocumentAction, toggleReusableAction, uploadDocumentAction } from "../actions";
import { loadMeetingRecord } from "../record";

export const dynamic = "force-dynamic";

/** Documents — the eight typed slots, three of which the readiness ring counts; files drop straight onto them. */
export default async function MeetingDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  return (
    <DocumentsTab
      meetingId={record.id}
      documents={record.documents}
      canAdd={record.permissions.addDocument}
      addDocument={addDocumentAction}
      uploadDocument={uploadDocumentAction}
      reuseDocument={reuseDocumentAction}
      toggleReusable={toggleReusableAction}
      removeDocument={removeDocumentAction}
    />
  );
}
