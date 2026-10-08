import Link from "next/link";
import { notFound } from "next/navigation";
import { EditMeetingForm, type EditTopicOption, type EditUserOption } from "@/components/meetings/record/EditMeetingForm";
import { Panel } from "@/components/meetings/record/Panel";
import { getDb } from "@/lib/db/client";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { updateMeetingAction } from "./actions";
import { loadMeetingRecord } from "../record";

export const dynamic = "force-dynamic";

/** Who the Ownership panel can hand a meeting to — the same OIA casework pool the wizard offers. */
const ASSIGNABLE_ROLES: readonly string[] = ["admin", "coordinator", "regional_lead"];

/** Edit — the request essentials, ownership and ranked topics. Everything else (schedule, people, agenda, documents) has its own tab. */
export default async function MeetingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await loadMeetingRecord(id);
  if (!record) notFound();

  if (!record.permissions.update) {
    return (
      <Panel id="edit-locked-heading" eyebrow="Edit" title="Not available">
        <p className="text-sm text-muted-foreground">
          You can view this meeting but not edit it.{" "}
          <Link href={record.href} className="font-medium text-primary underline underline-offset-4 hover:no-underline">
            Back to the record
          </Link>
          .
        </p>
      </Panel>
    );
  }

  const reference = makeReferenceRepo(await getDb());
  const [topics, users] = await Promise.all([reference.topics(), reference.users()]);

  // Meetings are filed against leaf topics; the parents are only group headings in the picker.
  const parentName = new Map(topics.map((t) => [t.id, t.name]));
  const topicOptions: EditTopicOption[] = topics
    .filter((topic) => !topics.some((other) => other.parentId === topic.id))
    .map((topic) => ({ id: topic.id, name: topic.name, group: topic.parentId ? (parentName.get(topic.parentId) ?? "Cross-cutting") : "Cross-cutting" }));

  const userOptions: EditUserOption[] = users.filter((user) => ASSIGNABLE_ROLES.includes(user.role)).map((user) => ({ id: user.id, name: user.name, title: user.staff?.title ?? null }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="eyebrow">Edit</p>
        <h2 className="heading-display mt-1 text-xl leading-none">{record.code}</h2>
      </div>

      <EditMeetingForm record={record} topicOptions={topicOptions} userOptions={userOptions} updateMeeting={updateMeetingAction} />
    </div>
  );
}
