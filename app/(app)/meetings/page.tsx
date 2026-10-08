import type { Metadata } from "next";
import { Suspense } from "react";
import { MeetingsWorkspace } from "@/components/meetings/MeetingsWorkspace";
import type { FilterOption, MeetingsFilterOptions } from "@/components/meetings/options";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import type { Role } from "@/lib/domain/types";

export const metadata: Metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

/** Roles that carry meetings; anyone else would only pad the "Lead" filter. */
const LEAD_ROLES: readonly Role[] = ["admin", "coordinator", "regional_lead"];

/** FY filter range: next year is already being planned, and three back covers the reporting window. */
function fiscalYearsAround(current: number): number[] {
  return [current + 1, current, current - 1, current - 2];
}

async function loadFilterOptions(regionIds: string[], now: Date): Promise<MeetingsFilterOptions> {
  const reference = makeReferenceRepo(await getDb());
  const [regions, countries, topics, bureaus, users] = await Promise.all([reference.regions(), reference.countries(), reference.topics(), reference.bureaus(), reference.users()]);

  const regionOptions: FilterOption[] = regions.map((region) => ({ value: region.id, label: region.name }));
  const regionNames = new Map(regionOptions.map((option) => [option.value, option.label]));
  const myRegionId = regionIds[0] ?? null;
  const currentFiscalYear = fiscalYearOf(now);

  return {
    regions: regionOptions,
    countries: countries.map((country) => ({ value: country.cca2, label: country.name, hint: country.region.name })),
    topics: topics.map((topic) => ({ value: topic.id, label: topic.name })),
    bureaus: bureaus.map((bureau) => ({ value: bureau.code, label: bureau.name, hint: bureau.code })),
    leads: users.filter((user) => LEAD_ROLES.includes(user.role)).map((user) => ({ value: user.id, label: user.name })),
    fiscalYears: fiscalYearsAround(currentFiscalYear),
    currentFiscalYear,
    spaceBureauCode: bureaus.find((bureau) => bureau.name === "Space Bureau")?.code ?? null,
    myRegion: myRegionId ? { value: myRegionId, label: regionNames.get(myRegionId) ?? "My region" } : null,
  };
}

function WorkspaceFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading meetings…</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-[5.25rem] w-full rounded-xl" />
      <Skeleton className="h-[32rem] rounded-xl" />
    </div>
  );
}

export default async function MeetingsPage() {
  const user = await requireUser("/meetings");
  const now = new Date();
  const options = await loadFilterOptions(user.regionIds, now);

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <MeetingsWorkspace options={options} nowMs={now.getTime()} />
    </Suspense>
  );
}
