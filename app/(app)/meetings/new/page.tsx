import type { Metadata } from "next";
import { PageTitle } from "@/components/common/PageTitle";
import { Wizard } from "@/components/meetings/wizard/Wizard";
import type { WizardOptions } from "@/components/meetings/wizard/wizard-schema";
import { requireCan } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { createMeetingAction } from "../actions";

export const metadata: Metadata = { title: "New meeting" };
export const dynamic = "force-dynamic";

/** Who can be handed a visit: coordinators and regional leads run them, admins stand in. */
const LEAD_ROLES: readonly string[] = ["admin", "coordinator", "regional_lead"];

export default async function NewMeetingPage() {
  // Same rule the top bar uses to show "New meeting"; anyone else lands on the 403 page.
  await requireCan("meeting.create", { kind: "system" }, "/meetings/new");

  const reference = makeReferenceRepo(await getDb());
  const [countries, regions, topics, users] = await Promise.all([reference.countries(), reference.regions(), reference.topics(), reference.users()]);

  // Meetings are filed against leaf topics; the parents are only headings in the picker.
  const parentName = new Map(topics.map((t) => [t.id, t.name]));
  const leaves = topics.filter((topic) => !topics.some((other) => other.parentId === topic.id));

  const options: WizardOptions = {
    countries: countries.map((country) => ({ code: country.cca2, name: country.name, regionId: country.regionId })),
    regions: regions.map((region) => ({ id: region.id, name: region.name })),
    topics: leaves.map((topic) => ({ id: topic.id, name: topic.name, group: topic.parentId ? (parentName.get(topic.parentId) ?? "Cross-cutting") : "Cross-cutting" })),
    leads: users.filter((user) => LEAD_ROLES.includes(user.role)).map((user) => ({ id: user.id, name: user.name, title: user.staff?.title ?? null })),
  };

  return (
    <div className="relative">
      <PageTitle>New meeting</PageTitle>
      <Wizard options={options} action={createMeetingAction} />
    </div>
  );
}
