import { and, eq, exists, inArray, sql, type SQL } from "drizzle-orm";
import type { DocumentLibraryQueryInput } from "@/lib/api/schemas";
import { currentVersions, isPreviewable, storageScheme, type PreviewKind, type StorageScheme } from "@/lib/domain/documents";
import type { ReadableScope } from "@/lib/domain/policy";
import { countBy, type NamedCount } from "@/lib/domain/tallies";
import { DOCUMENT_KIND_LABELS, type DocumentKind, type MeetingStatus } from "@/lib/domain/types";
import type { Db } from "../factory";
import * as s from "../schema";
import { foldText } from "./search";

/* --------------------------------- types --------------------------------- */

/** One row of the library: the document plus enough of its meeting to filter, sort and show. */
export type DocumentLibraryItem = {
  id: string;
  meetingId: string;
  meetingCode: string;
  meetingTitle: string;
  meetingStatus: MeetingStatus;
  scheduledStart: Date | null;
  countryCode: string;
  countryName: string;
  regionId: string;
  regionName: string;
  orgId: string | null;
  orgName: string;
  orgShortName: string | null;
  fiscalYear: number;
  kind: DocumentKind;
  kindLabel: string;
  title: string;
  filename: string | null;
  mime: string | null;
  size: number | null;
  version: number;
  /** The highest version of its kind on its meeting — what the slot shows and readiness reads. */
  isCurrent: boolean;
  reusable: boolean;
  sourceDocumentId: string | null;
  sourceMeetingCode: string | null;
  sourceMeetingId: string | null;
  topics: { id: string; name: string }[];
  addedAt: Date;
  addedByName: string | null;
  preview: PreviewKind | null;
  storageScheme: StorageScheme;
  /** For a document kept elsewhere: its address, when it is one a browser can open. */
  link: string | null;
};

/** One document, every version of its slot (newest first) and the original it was reused from. */
export type DocumentDetail = { item: DocumentLibraryItem; versions: DocumentLibraryItem[]; source: DocumentLibraryItem | null };

/* -------------------------------- loading -------------------------------- */

function load(db: Db, where: SQL | undefined) {
  return db.query.meetingDocuments.findMany({
    where,
    with: {
      meeting: {
        with: {
          primaryCountry: true,
          region: true,
          organization: true,
          topics: { with: { topic: true }, orderBy: (t, { asc }) => [asc(t.rank)] },
        },
      },
      addedBy: { columns: { name: true } },
      source: { with: { meeting: { columns: { id: true, code: true } } } },
    },
  });
}
type Row = Awaited<ReturnType<typeof load>>[number];

/** Which rows are the highest version of their kind on their meeting. */
function currentIds(rows: Row[]): Set<string> {
  const byMeeting = new Map<string, Row[]>();
  for (const row of rows) byMeeting.set(row.meetingId, [...(byMeeting.get(row.meetingId) ?? []), row]);
  const ids = new Set<string>();
  for (const docs of byMeeting.values()) for (const doc of currentVersions(docs)) ids.add(doc.id);
  return ids;
}

function toItem(row: Row, current: Set<string>): DocumentLibraryItem {
  const m = row.meeting;
  return {
    id: row.id,
    meetingId: row.meetingId,
    meetingCode: m.code,
    meetingTitle: m.title,
    meetingStatus: m.status,
    scheduledStart: m.scheduledStart,
    countryCode: m.primaryCountryCode,
    countryName: m.primaryCountry.name,
    regionId: m.regionId,
    regionName: m.region.name,
    orgId: m.organizationId,
    orgName: m.organization?.name ?? "—",
    orgShortName: m.organization?.shortName ?? null,
    fiscalYear: m.fiscalYear,
    kind: row.kind,
    kindLabel: DOCUMENT_KIND_LABELS[row.kind],
    title: row.title,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    version: row.version,
    isCurrent: current.has(row.id),
    reusable: row.reusable,
    sourceDocumentId: row.sourceDocumentId,
    sourceMeetingCode: row.source?.meeting.code ?? null,
    sourceMeetingId: row.source?.meeting.id ?? null,
    topics: m.topics.map((t) => ({ id: t.topic.id, name: t.topic.name })),
    addedAt: row.addedAt,
    addedByName: row.addedBy?.name ?? null,
    preview: isPreviewable(row.mime),
    storageScheme: storageScheme(row.storageKey),
    link: row.storageKey && storageScheme(row.storageKey) === "link" && /^https?:\/\//i.test(row.storageKey) ? row.storageKey : null,
  };
}

/** Rows → items with `isCurrent` judged against every version on the same meeting, not just the ones that matched. */
async function toItems(db: Db, rows: Row[]): Promise<DocumentLibraryItem[]> {
  if (!rows.length) return [];
  const meetingIds = [...new Set(rows.map((r) => r.meetingId))];
  const siblings = await db
    .select({ id: s.meetingDocuments.id, meetingId: s.meetingDocuments.meetingId, kind: s.meetingDocuments.kind, version: s.meetingDocuments.version })
    .from(s.meetingDocuments)
    .where(inArray(s.meetingDocuments.meetingId, meetingIds));
  const current = currentIds(siblings as Row[]);
  return rows.map((row) => toItem(row, current));
}

/* -------------------------------- filters -------------------------------- */

/** Meeting-level filters become one subquery on `meetings`; the document's own columns filter directly. */
function buildWhere(db: Db, q: Partial<DocumentLibraryQueryInput>, scope: ReadableScope): SQL | undefined {
  const conds: SQL[] = [];
  if (q.kind) conds.push(eq(s.meetingDocuments.kind, q.kind));
  if (q.reusable !== undefined) conds.push(eq(s.meetingDocuments.reusable, q.reusable));

  const meetingConds: SQL[] = [];
  if (q.fy) meetingConds.push(eq(s.meetings.fiscalYear, q.fy));
  if (q.regionId) meetingConds.push(eq(s.meetings.regionId, q.regionId));
  if (q.countryCode) meetingConds.push(eq(s.meetings.primaryCountryCode, q.countryCode.toUpperCase()));
  if (q.orgId) meetingConds.push(eq(s.meetings.organizationId, q.orgId));
  if (q.status?.length) meetingConds.push(inArray(s.meetings.status, [...q.status]));
  if (q.topicId) meetingConds.push(exists(db.select({ one: sql`1` }).from(s.meetingTopics).where(and(eq(s.meetingTopics.meetingId, s.meetings.id), eq(s.meetingTopics.topicId, q.topicId)))));
  if ("staffId" in scope) meetingConds.push(exists(db.select({ one: sql`1` }).from(s.meetingExperts).where(and(eq(s.meetingExperts.meetingId, s.meetings.id), eq(s.meetingExperts.staffId, scope.staffId)))));
  if (meetingConds.length) conds.push(inArray(s.meetingDocuments.meetingId, db.select({ id: s.meetings.id }).from(s.meetings).where(and(...meetingConds))));

  return conds.length ? and(...conds) : undefined;
}

/** Free text over what a coordinator remembers: the title, the meeting, who came and what it was about. */
function matches(item: DocumentLibraryItem, needle: string): boolean {
  const hay = [item.title, item.meetingCode, item.meetingTitle, item.orgName, item.orgShortName ?? "", item.countryName, item.filename ?? "", ...item.topics.map((t) => t.name)].map(foldText).join("\n");
  return hay.includes(needle);
}

function sortItems(items: DocumentLibraryItem[], sort: DocumentLibraryQueryInput["sort"]): DocumentLibraryItem[] {
  const byNewest = (a: DocumentLibraryItem, b: DocumentLibraryItem) => b.addedAt.getTime() - a.addedAt.getTime() || a.title.localeCompare(b.title, "en");
  return [...items].sort((a, b) => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title, "en") || byNewest(a, b);
      case "meeting": {
        // Dated meetings first, most recent first; undated ones trail, newest document first.
        if (a.scheduledStart && b.scheduledStart) return b.scheduledStart.getTime() - a.scheduledStart.getTime() || a.meetingCode.localeCompare(b.meetingCode) || byNewest(a, b);
        if (a.scheduledStart || b.scheduledStart) return a.scheduledStart ? -1 : 1;
        return byNewest(a, b);
      }
      default:
        return byNewest(a, b);
    }
  });
}

/* ---------------------------------- repo ---------------------------------- */

export function makeDocumentsRepo(db: Db) {
  return {
    /** The library. Filters run in SQL; search, sort and paging run in memory over a few hundred rows. */
    async list(q: DocumentLibraryQueryInput, scope: ReadableScope): Promise<{ items: DocumentLibraryItem[]; total: number }> {
      const rows = await load(db, buildWhere(db, q, scope));
      let items = await toItems(db, rows);
      const needle = q.q ? foldText(q.q) : "";
      if (needle) items = items.filter((item) => matches(item, needle));
      const sorted = sortItems(items, q.sort);
      const start = (q.page - 1) * q.pageSize;
      return { items: sorted.slice(start, start + q.pageSize), total: sorted.length };
    },

    /** The whole shelf this scope can see, newest first — what the filter options are drawn from. */
    async all(scope: ReadableScope): Promise<DocumentLibraryItem[]> {
      const rows = await load(db, buildWhere(db, {}, scope));
      return sortItems(await toItems(db, rows), "newest");
    },

    /** Everything on a set of meetings, newest first — a dossier's materials shelf. */
    async forMeetings(meetingIds: string[]): Promise<DocumentLibraryItem[]> {
      if (!meetingIds.length) return [];
      const rows = await load(db, inArray(s.meetingDocuments.meetingId, meetingIds));
      return sortItems(await toItems(db, rows), "newest");
    },

    /**
     * One document with every version of its slot and the original it was reused from — what the
     * drawer shows. Null when the id is unknown or the document lies outside the scope, so a
     * caller cannot tell the two apart. A source outside the scope is simply absent.
     */
    async detail(id: string, scope: ReadableScope): Promise<DocumentDetail | null> {
      const [row] = await load(db, and(eq(s.meetingDocuments.id, id), buildWhere(db, {}, scope)));
      if (!row) return null;
      const [siblings, sourceRows] = await Promise.all([
        load(db, and(eq(s.meetingDocuments.meetingId, row.meetingId), eq(s.meetingDocuments.kind, row.kind))),
        row.sourceDocumentId ? load(db, and(eq(s.meetingDocuments.id, row.sourceDocumentId), buildWhere(db, {}, scope))) : Promise.resolve([] as Row[]),
      ]);
      const byId = new Map<string, DocumentLibraryItem>();
      for (const item of await toItems(db, [...siblings, ...sourceRows])) byId.set(item.id, item);
      const item = byId.get(id);
      if (!item) return null;
      const versions = [...byId.values()].filter((d) => d.meetingId === row.meetingId && d.kind === row.kind).sort((a, b) => b.version - a.version || b.addedAt.getTime() - a.addedAt.getTime());
      const source = row.sourceDocumentId ? (byId.get(row.sourceDocumentId) ?? null) : null;
      return { item, versions, source };
    },

    /** Topics with starred documents, most first — what the reuse strip offers. */
    async reusableTopics(scope: ReadableScope): Promise<NamedCount[]> {
      const rows = await load(db, buildWhere(db, { reusable: true }, scope));
      const names = new Map<string, string>();
      for (const row of rows) for (const t of row.meeting.topics) names.set(t.topic.id, t.topic.name);
      return countBy(
        rows,
        (row) => row.meeting.topics.map((t) => t.topic.id),
        (id) => names.get(id) ?? id,
      );
    },
  };
}

export type DocumentsRepo = ReturnType<typeof makeDocumentsRepo>;
