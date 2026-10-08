import { and, count, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import * as s from "@/lib/db/schema";
import type { DocumentKind } from "@/lib/domain/types";

/**
 * Document *metadata* only — titles, kinds, versions and a storage pointer. The bytes live
 * behind `BlobStore` (uploads in `document_blobs`, seeded files synthesized on request,
 * SharePoint in production); a `storageKey` string is enough to find them. `LocalDocumentStore`
 * persists that metadata in `meeting_documents`; a Phase 4 adapter would talk to the SharePoint
 * Graph API behind the same calls.
 */
export type DocumentMeta = {
  id: string;
  meetingId: string;
  kind: DocumentKind;
  title: string;
  storageKey: string | null;
  version: number;
  reusable: boolean;
  addedById: string | null;
  addedAt: Date;
  /** As uploaded; what a download is called. Null for link-only metadata. */
  filename: string | null;
  mime: string | null;
  size: number | null;
  sha256: string | null;
  /** The row this one was copied from by "Reuse in a meeting"; null for an original. */
  sourceDocumentId: string | null;
};

export type NewDocumentMeta = {
  kind: DocumentKind;
  title: string;
  storageKey?: string | null;
  version?: number;
  reusable?: boolean;
  addedById?: string | null;
  addedAt?: Date;
  filename?: string | null;
  mime?: string | null;
  size?: number | null;
  sha256?: string | null;
  sourceDocumentId?: string | null;
};

export interface DocumentStore {
  list(meetingId: string): Promise<DocumentMeta[]>;
  get(id: string): Promise<DocumentMeta | null>;
  add(meetingId: string, meta: NewDocumentMeta): Promise<DocumentMeta>;
  /** The reusable flag is metadata about the file, so it moves with the file, not around it. */
  setReusable(id: string, reusable: boolean): Promise<DocumentMeta | null>;
  remove(id: string): Promise<void>;
  /** Every version of one slot on one meeting, newest first. */
  versions(meetingId: string, kind: DocumentKind): Promise<DocumentMeta[]>;
  /** How many rows still point at a storage key — zero means the bytes may go. */
  references(storageKey: string): Promise<number>;
}

function toMeta(row: typeof s.meetingDocuments.$inferSelect): DocumentMeta {
  return {
    id: row.id,
    meetingId: row.meetingId,
    kind: row.kind,
    title: row.title,
    storageKey: row.storageKey,
    version: row.version,
    reusable: row.reusable,
    addedById: row.addedById,
    addedAt: row.addedAt,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    sourceDocumentId: row.sourceDocumentId,
  };
}

/** Backed by the `meeting_documents` table. */
export class LocalDocumentStore implements DocumentStore {
  constructor(private readonly db: Db) {}

  async list(meetingId: string): Promise<DocumentMeta[]> {
    const rows = await this.db.query.meetingDocuments.findMany({
      where: eq(s.meetingDocuments.meetingId, meetingId),
      orderBy: (d, { desc }) => [desc(d.addedAt)],
    });
    return rows.map(toMeta);
  }

  async get(id: string): Promise<DocumentMeta | null> {
    const row = await this.db.query.meetingDocuments.findFirst({ where: eq(s.meetingDocuments.id, id) });
    return row ? toMeta(row) : null;
  }

  async add(meetingId: string, meta: NewDocumentMeta): Promise<DocumentMeta> {
    const row: DocumentMeta = {
      id: newId("doc"),
      meetingId,
      kind: meta.kind,
      title: meta.title,
      storageKey: meta.storageKey ?? null,
      version: meta.version ?? 1,
      reusable: meta.reusable ?? false,
      addedById: meta.addedById ?? null,
      addedAt: meta.addedAt ?? new Date(),
      filename: meta.filename ?? null,
      mime: meta.mime ?? null,
      size: meta.size ?? null,
      sha256: meta.sha256 ?? null,
      sourceDocumentId: meta.sourceDocumentId ?? null,
    };
    await this.db.insert(s.meetingDocuments).values(row);
    return row;
  }

  async setReusable(id: string, reusable: boolean): Promise<DocumentMeta | null> {
    await this.db.update(s.meetingDocuments).set({ reusable }).where(eq(s.meetingDocuments.id, id));
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(s.meetingDocuments).where(eq(s.meetingDocuments.id, id));
  }

  async versions(meetingId: string, kind: DocumentKind): Promise<DocumentMeta[]> {
    const rows = await this.db
      .select()
      .from(s.meetingDocuments)
      .where(and(eq(s.meetingDocuments.meetingId, meetingId), eq(s.meetingDocuments.kind, kind)))
      .orderBy(desc(s.meetingDocuments.version), desc(s.meetingDocuments.addedAt));
    return rows.map(toMeta);
  }

  async references(storageKey: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(s.meetingDocuments).where(eq(s.meetingDocuments.storageKey, storageKey));
    return Number(row?.n ?? 0);
  }
}
