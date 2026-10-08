import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/common/PageTitle";
import { ExpertsWorkspace } from "@/components/directory/ExpertsWorkspace";
import type { OrganizationRowData } from "@/components/directory/OrganizationsTable";
import { OrganizationsWorkspace } from "@/components/directory/OrganizationsWorkspace";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import type { Db } from "@/lib/db/factory";
import { makeDirectoryRepo } from "@/lib/db/repos/directory";
import { pageSlice, readDirectoryQuery } from "@/lib/domain/directory-query";
import { can } from "@/lib/domain/policy";
import { directoryCounts, listExpertsPage, listOrganizationsSummary } from "@/lib/services/directory";

export const metadata: Metadata = { title: "Directory" };
export const dynamic = "force-dynamic";

/** Every matching organization paired with its own contacts, loaded with one query for all contacts rather than one per row. */
async function organizationsWithContacts(db: Db, q: string): Promise<OrganizationRowData[]> {
  const dir = makeDirectoryRepo(db);
  const [organizations, allContacts] = await Promise.all([listOrganizationsSummary(db, q || undefined), dir.listContacts()]);
  const contactsByOrg = new Map<string, typeof allContacts>();
  for (const contact of allContacts) {
    if (!contact.organizationId) continue;
    contactsByOrg.set(contact.organizationId, [...(contactsByOrg.get(contact.organizationId) ?? []), contact]);
  }
  return organizations.map((org) => ({
    ...org,
    contacts: (contactsByOrg.get(org.id) ?? []).map((c) => ({ id: c.id, name: c.name, title: c.title, email: c.email, phone: c.phone })),
  }));
}

/**
 * The URL is the state — the tab, the search, the bureau, the sort and the page — and the server
 * reads it: each list arrives already filtered, sorted and cut to one page.
 */
export default async function DirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser("/directory");
  if (!can(toPolicyUser(user), "directory.read", { kind: "system" })) redirect("/forbidden");

  const query = readDirectoryQuery(await searchParams);
  const db = await getDb();

  return (
    <div className="relative space-y-4">
      <PageTitle>People &amp; places</PageTitle>
      {query.tab === "experts" ? <Experts db={db} query={query} /> : <Organizations db={db} query={query} />}
    </div>
  );
}

type Query = ReturnType<typeof readDirectoryQuery>;

async function Experts({ db, query }: { db: Db; query: Query }) {
  const [counts, bureaus, page] = await Promise.all([
    directoryCounts(db),
    makeDirectoryRepo(db).bureausWithCounts(),
    listExpertsPage(db, { q: query.q || undefined, bureauCode: query.bureauCode || undefined, sort: query.sort }, query),
  ]);
  return <ExpertsWorkspace page={page} sort={query.sort} counts={counts} bureaus={bureaus.map((bureau) => ({ code: bureau.code, name: bureau.name, staff: bureau.staff }))} />;
}

async function Organizations({ db, query }: { db: Db; query: Query }) {
  const [counts, organizations] = await Promise.all([directoryCounts(db), organizationsWithContacts(db, query.q)]);
  return <OrganizationsWorkspace page={pageSlice(organizations, query.page, query.pageSize)} counts={counts} />;
}
