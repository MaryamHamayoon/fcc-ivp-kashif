import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CountryOrganizations } from "@/components/countries/CountryOrganizations";
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
import { countryName, getCountryProfile } from "@/lib/services/directory";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: (await countryName(await getDb(), code)) ?? "Country" };
}

export default async function CountryProfilePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireCan("directory.read", { kind: "system" }, `/countries/${code}`);
  const actor = toPolicyUser(user);
  const now = new Date();
  const profile = await getCountryProfile(await getDb(), code, now, actor);
  if (!profile) notFound();
  const { dossier } = profile;

  return (
    <div className="space-y-8">
      <DossierHero flagCode={profile.cca2} eyebrow={profile.regionName} title={profile.name} figures={dossier.figures} materialsHref={dossier.materialsHref} exportHref={can(actor, "reports.read", { kind: "system" }) ? historyExportHref({ countryCode: profile.cca2 }) : null} />

      <EngagementTimeline timeline={dossier.timeline} now={now} subject={profile.name} />

      <div className="grid items-start gap-8 lg:grid-cols-2">
        <DossierSection id="country-orgs" title="Organizations & contacts">
          <CountryOrganizations organizations={profile.organizations} />
        </DossierSection>
        <DossierSection id="country-briefers" title="FCC experts who have briefed them">
          <BriefersList briefers={dossier.briefers} />
        </DossierSection>
      </div>

      <DossierSection id="country-materials" title="Materials">
        <DossierMaterials materials={dossier.materials} total={dossier.materialsTotal} href={dossier.materialsHref} subject={profile.name} user={actor} />
      </DossierSection>

      <DossierSection id="country-history" title="Engagement history">
        <MeetingHistoryList items={profile.history} emptyMessage="No meetings recorded for this country yet." />
      </DossierSection>
    </div>
  );
}
