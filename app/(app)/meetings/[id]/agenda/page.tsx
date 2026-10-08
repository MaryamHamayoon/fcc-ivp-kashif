import { notFound } from "next/navigation";
import { AgendaTab } from "@/components/meetings/record/AgendaTab";
import { deleteAgendaItemAction, upsertAgendaItemAction } from "../actions";
import { loadMeetingRecord } from "../record";

export const dynamic = "force-dynamic";

/** Agenda — the run of show, built from topics the delegation asked for and briefers who confirmed. */
export default async function MeetingAgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  return <AgendaTab record={record} upsertAgendaItem={upsertAgendaItemAction} deleteAgendaItem={deleteAgendaItemAction} />;
}
