import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContactsList } from "@/components/directory/ContactsList";
import { MeetingHistoryList } from "@/components/directory/MeetingHistoryList";
import { BriefersList } from "@/components/dossier/BriefersList";
import { DossierHero } from "@/components/dossier/DossierHero";
import { DossierMaterials } from "@/components/dossier/DossierMaterials";
import { DossierSection } from "@/components/dossier/DossierSection";
import { EngagementTimeline } from "@/components/dossier/EngagementTimeline";
import { requireCan, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/domain/policy";
import { historyExportHref } from "@/lib/reports/href";
import { getOrganizationProfile, organizationName } from "@/lib/services/directory";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: (await organizationName(await getDb(), id)) ?? "Organization" };
}

export default async function OrganizationProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCan("directory.read", { kind: "system" }, `/directory/organizations/${id}`);
  const actor = toPolicyUser(user);
  const now = new Date();
  const profile = await getOrganizationProfile(await getDb(), id, now, actor);
  if (!profile) notFound();
  const { dossier } = profile;
  const shortName = profile.shortName ?? profile.name;

  return (
    <div className="space-y-8">
      <DossierHero
        flagCode={profile.countryCode}
        eyebrow={profile.countryName ? `${profile.kindLabel} · ${profile.countryName}` : `${profile.kindLabel} · International`}
        title={profile.shortName ? `${profile.shortName} — ${profile.name}` : profile.name}
        subtitle={
          profile.website ? (
            <a href={profile.website} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
              {profile.website.replace(/^https?:\/\//, "")}
            </a>
          ) : undefined
        }
        figures={dossier.figures}
        materialsHref={dossier.materialsHref}
        exportHref={can(actor, "reports.read", { kind: "system" }) ? historyExportHref({ orgId: profile.id }) : null}
      />

      <EngagementTimeline timeline={dossier.timeline} now={now} subject={shortName} />

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <DossierSection id="org-contacts" title="Contacts">
          <ContactsList contacts={profile.contacts} />
        </DossierSection>
        <DossierSection id="org-briefers" title="FCC experts who have briefed them">
          <BriefersList briefers={dossier.briefers} />
        </DossierSection>
      </div>

      <DossierSection id="org-materials" title="Materials">
        <DossierMaterials materials={dossier.materials} total={dossier.materialsTotal} href={dossier.materialsHref} subject={shortName} user={actor} />
      </DossierSection>

      <DossierSection id="org-history" title="Meeting history">
        <MeetingHistoryList items={profile.history} emptyMessage="No meetings recorded with this organization yet." />
      </DossierSection>
    </div>
  );
}
