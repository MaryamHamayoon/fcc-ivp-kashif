import type { DocumentLibraryQueryInput } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { type DocumentDetail, type DocumentLibraryItem, makeDocumentsRepo } from "@/lib/db/repos/documents";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { can, type PolicyUser, readableScope, type ReadableScope } from "@/lib/domain/policy";
import type { NamedCount } from "@/lib/domain/tallies";
import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS, type DocumentKind, MEETING_STATUSES, type MeetingStatus, STATUS_LABELS } from "@/lib/domain/types";
import { NotFoundError, PolicyError } from "./errors";

export type { DocumentDetail };

/**
 * The document library: every file the program keeps, found by country, topic or meeting
 * rather than folder memory. Experts see the shelves of their own briefings; everyone else
 * with `meeting.read` sees the whole library.
 */

export type LibraryFilterOptions = {
  kinds: { value: DocumentKind; label: string }[];
  statuses: { value: MeetingStatus; label: string }[];
  /** Only values present on the shelf this user can see, so no filter ever yields nothing. */
  topics: { id: string; name: string }[];
  countries: { code: string; name: string; regionId: string }[];
  regions: { id: string; name: string }[];
  organizations: { id: string; name: string }[];
  /** Newest first. */
  fiscalYears: number[];
  /** Topics with starred documents, most first — the reuse strip. */
  reusableTopics: NamedCount[];
  /** Starred documents on the shelf this user can see; the strip's headline count. */
  reusableTotal: number;
};

function scopeFor(actor: PolicyUser): ReadableScope {
  if (!can(actor, "meeting.read", { kind: "system" }) && actor.role !== "expert") throw new PolicyError();
  const scope = readableScope(actor);
  // An expert without a staff record can be assigned to nothing; say so rather than show an empty room.
  if ("staffId" in scope && !scope.staffId) throw new PolicyError();
  return scope;
}

export async function listLibrary(db: Db, query: DocumentLibraryQueryInput, actor: PolicyUser): Promise<{ items: DocumentLibraryItem[]; total: number }> {
  return makeDocumentsRepo(db).list(query, scopeFor(actor));
}

/**
 * One document for the drawer. Outside the reader's scope — or for a reader with no scope at
 * all — it is not found rather than forbidden, so the drawer cannot be used to probe the shelf.
 */
export async function getDocumentDetail(db: Db, id: string, actor: PolicyUser): Promise<DocumentDetail> {
  let scope: ReadableScope;
  try {
    scope = scopeFor(actor);
  } catch (error) {
    if (error instanceof PolicyError) throw new NotFoundError("Document");
    throw error;
  }
  const detail = await makeDocumentsRepo(db).detail(id, scope);
  if (!detail) throw new NotFoundError("Document");
  return detail;
}

export async function libraryOptions(db: Db, actor: PolicyUser): Promise<LibraryFilterOptions> {
  const scope = scopeFor(actor);
  const repo = makeDocumentsRepo(db);
  const [items, regions, reusableTopics] = await Promise.all([repo.all(scope), makeReferenceRepo(db).regions(), repo.reusableTopics(scope)]);

  const topics = new Map<string, string>();
  const countries = new Map<string, { code: string; name: string; regionId: string }>();
  const organizations = new Map<string, string>();
  const regionIds = new Set<string>();
  const fiscalYears = new Set<number>();
  let reusableTotal = 0;
  for (const d of items) {
    if (d.reusable) reusableTotal += 1;
    for (const t of d.topics) topics.set(t.id, t.name);
    countries.set(d.countryCode, { code: d.countryCode, name: d.countryName, regionId: d.regionId });
    if (d.orgId) organizations.set(d.orgId, d.orgName);
    regionIds.add(d.regionId);
    fiscalYears.add(d.fiscalYear);
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en");

  return {
    kinds: DOCUMENT_KINDS.map((value) => ({ value, label: DOCUMENT_KIND_LABELS[value] })),
    statuses: MEETING_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
    topics: [...topics].map(([id, name]) => ({ id, name })).sort(byName),
    countries: [...countries.values()].sort(byName),
    regions: regions.filter((r) => regionIds.has(r.id)).map((r) => ({ id: r.id, name: r.name })),
    organizations: [...organizations].map(([id, name]) => ({ id, name })).sort(byName),
    fiscalYears: [...fiscalYears].sort((a, b) => b - a),
    reusableTopics,
    reusableTotal,
  };
}
