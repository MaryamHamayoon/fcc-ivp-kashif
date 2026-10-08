import { DocumentInput, type DocumentInputRaw } from "@/lib/api/schemas";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import { makeActivitiesRepo } from "@/lib/db/repos/activities";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { nextVersion, reuseCheck, safeFilename, validateUpload } from "@/lib/domain/documents";
import type { PolicyUser } from "@/lib/domain/policy";
import { DOCUMENT_KIND_LABELS, type DocumentKind } from "@/lib/domain/types";
import { getIntegrations, type BlobContent, type DocumentMeta } from "@/lib/integrations";
import { requireMeeting } from "./access";
import { NotFoundError, PolicyError, ValidationError } from "./errors";

/**
 * The record's document shelf. Metadata goes through the `DocumentStore` seam and bytes through
 * `BlobStore`, never the tables: in Phase 2 those seams write `meeting_documents` and
 * `document_blobs`, and in Phase 4 the same calls talk to SharePoint. Versions are derived,
 * never typed; readiness reads what is actually on the shelf.
 */

/** Records that a document exists somewhere else — a SharePoint link, or metadata alone. */
export async function addDocument(db: Db, raw: DocumentInputRaw, actor: PolicyUser, now = new Date()): Promise<DocumentMeta> {
  const input = DocumentInput.parse(raw);
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "document.add");
  const store = getIntegrations(db).documentStore;

  const onFile = await store.list(meeting.id);
  const version = input.version ?? nextVersion(onFile, input.kind);

  const meta = await store.add(meeting.id, {
    kind: input.kind,
    title: input.title,
    storageKey: input.storageKey ?? null,
    version,
    reusable: input.reusable,
    addedById: actor.id,
    addedAt: now,
  });

  await logAdded(db, meta, `${DOCUMENT_KIND_LABELS[meta.kind]} added — ${meta.title}${versionSuffix(meta.version)}.`, actor, now);
  return meta;
}

export type UploadInput = {
  meetingId: string;
  kind: DocumentKind;
  /** Defaults to the filename without its extension. */
  title?: string;
  reusable?: boolean;
  file: { name: string; mime: string; bytes: Uint8Array };
};

/** Puts a real file on the shelf: bytes behind the blob seam, metadata behind the document seam. */
export async function uploadDocument(db: Db, input: UploadInput, actor: PolicyUser, now = new Date()): Promise<DocumentMeta> {
  const { meeting } = await requireMeeting(db, input.meetingId, actor, "document.add");
  const check = validateUpload({ name: input.file.name, mime: input.file.mime, size: input.file.bytes.byteLength });
  if (!check.ok) throw new ValidationError(check.reason);

  const { documentStore: store, blobStore } = getIntegrations(db);
  const title = input.title?.trim() || titleFromFilename(input.file.name);
  const put = await blobStore.put(input.file.bytes, { mime: check.mime });
  const version = nextVersion(await store.list(meeting.id), input.kind);

  const meta = await store.add(meeting.id, {
    kind: input.kind,
    title,
    storageKey: put.storageKey,
    filename: safeFilename(title, check.ext),
    mime: check.mime,
    size: put.size,
    sha256: put.sha256,
    version,
    reusable: input.reusable ?? false,
    addedById: actor.id,
    addedAt: now,
  });

  await logAdded(db, meta, `${DOCUMENT_KIND_LABELS[meta.kind]} uploaded — ${meta.title}${versionSuffix(meta.version)}.`, actor, now);
  return meta;
}

export type ReuseDocumentInput = { sourceId: string; meetingId: string; kind?: DocumentKind };

/**
 * "Reuse in a meeting": the same bytes appear in another meeting's slot as a new row that
 * remembers where it came from. A chain always points back at the original, so provenance
 * reads the same however many meetings a deck has travelled through.
 */
export async function reuseDocument(db: Db, input: ReuseDocumentInput, actor: PolicyUser, now = new Date()): Promise<DocumentMeta> {
  const store = getIntegrations(db).documentStore;
  const source = await store.get(input.sourceId);
  if (!source) throw new NotFoundError("Document");
  const { meeting: from } = await requireMeeting(db, source.meetingId, actor, "meeting.read");
  const { meeting: target } = await requireMeeting(db, input.meetingId, actor, "document.add");

  const kind = input.kind ?? source.kind;
  const onFile = await store.list(target.id);
  const check = reuseCheck(source, { meetingId: target.id, docs: onFile }, kind);
  if (!check.ok) throw new ValidationError(check.reason);

  const meta = await store.add(target.id, {
    kind,
    title: source.title,
    storageKey: source.storageKey,
    filename: source.filename,
    mime: source.mime,
    size: source.size,
    sha256: source.sha256,
    sourceDocumentId: source.sourceDocumentId ?? source.id,
    version: nextVersion(onFile, kind),
    reusable: false,
    addedById: actor.id,
    addedAt: now,
  });

  await logAdded(db, meta, `${DOCUMENT_KIND_LABELS[kind]} reused from ${from.code} — ${source.title}${versionSuffix(meta.version)}.`, actor, now);
  return meta;
}

export type OpenedDocument = { meta: DocumentMeta; meetingCode: string; blob: BlobContent | null };

/**
 * The metadata and, when IVP holds them, the bytes. Someone who may not read the meeting
 * gets "not found", never "forbidden": a document's existence is itself information.
 */
export async function openDocument(db: Db, documentId: string, actor: PolicyUser): Promise<OpenedDocument> {
  const { documentStore, blobStore } = getIntegrations(db);
  const meta = await documentStore.get(documentId);
  if (!meta) throw new NotFoundError("Document");

  let meetingCode: string;
  try {
    meetingCode = (await requireMeeting(db, meta.meetingId, actor, "meeting.read")).meeting.code;
  } catch (error) {
    if (error instanceof PolicyError) throw new NotFoundError("Document");
    throw error;
  }

  const blob = meta.storageKey ? await blobStore.get(meta.storageKey) : null;
  return { meta, meetingCode, blob };
}

async function requireDocument(db: Db, documentId: string, actor: PolicyUser): Promise<DocumentMeta> {
  const doc = await getIntegrations(db).documentStore.get(documentId);
  if (!doc) throw new NotFoundError("Document");
  await requireMeeting(db, doc.meetingId, actor, "document.add");
  return doc;
}

/** Stars a document as worth pulling into the next visit on the same topic. */
export async function toggleReusable(db: Db, documentId: string, reusable: boolean, actor: PolicyUser, now = new Date()): Promise<void> {
  const doc = await requireDocument(db, documentId, actor);
  await getIntegrations(db).documentStore.setReusable(doc.id, reusable);
  await makeMeetingsRepo(db).touch(doc.meetingId, now);
}

/** Takes a row off the shelf; the bytes go too once nothing else points at them. */
export async function removeDocument(db: Db, documentId: string, actor: PolicyUser, now = new Date()): Promise<void> {
  const doc = await requireDocument(db, documentId, actor);
  const { documentStore, blobStore } = getIntegrations(db);
  await documentStore.remove(doc.id);
  if (doc.storageKey && (await documentStore.references(doc.storageKey)) === 0) await blobStore.delete(doc.storageKey);

  // Readiness can fall when a document leaves, so the record says who took it off the shelf.
  await makeActivitiesRepo(db).insert({
    id: newId("act"),
    meetingId: doc.meetingId,
    kind: "system",
    body: `${DOCUMENT_KIND_LABELS[doc.kind]} removed — ${doc.title}.`,
    occurredAt: now,
    authorId: actor.id,
    createdAt: now,
  });
  await makeMeetingsRepo(db).touch(doc.meetingId, now);
}

/* -------------------------------- helpers -------------------------------- */

const versionSuffix = (version: number) => (version > 1 ? ` (v${version})` : "");

/** "Q3_deck-final.PDF" → "Q3 deck final". */
function titleFromFilename(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return stem || "Document";
}

async function logAdded(db: Db, meta: DocumentMeta, body: string, actor: PolicyUser, now: Date): Promise<void> {
  await makeActivitiesRepo(db).insert({ id: newId("act"), meetingId: meta.meetingId, kind: "document_added", body, occurredAt: now, authorId: actor.id, createdAt: now });
  await makeMeetingsRepo(db).touch(meta.meetingId, now);
}
