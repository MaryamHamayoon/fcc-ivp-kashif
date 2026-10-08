import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/factory";
import { newId } from "@/lib/db/ids";
import * as s from "@/lib/db/schema";
import { storageScheme } from "@/lib/domain/documents";
import { synthesizeSeedDocument } from "./seed-documents";

/**
 * Where the bytes live. Metadata stays in `DocumentStore`; this seam only ever sees a storage
 * key. `LocalBlobStore` keeps uploads in `document_blobs` (`blob://<id>`) and answers `seed://`
 * keys by synthesizing the file from the record, so every seeded row opens a real document
 * without a byte being stored at seed time. A Phase 4 adapter talks to SharePoint behind the
 * same three calls and never has to know which of its keys came from a seed.
 */

export type BlobContent = { bytes: Uint8Array; mime: string; size: number; sha256: string | null };
export type PutResult = { storageKey: string; size: number; sha256: string };

export interface BlobStore {
  /** Identical bytes share one row; the returned key is the one to keep on the metadata. */
  put(bytes: Uint8Array, meta: { mime: string }): Promise<PutResult>;
  /** Null for a key this store has nothing for — a SharePoint link, or bytes already deleted. */
  get(storageKey: string): Promise<BlobContent | null>;
  /** Removes bytes this store holds; a no-op for any other key. Callers check references first. */
  delete(storageKey: string): Promise<void>;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const PREFIX = "blob://";
const SEED_PREFIX = "seed://";

export class LocalBlobStore implements BlobStore {
  constructor(private readonly db: Db) {}

  async put(bytes: Uint8Array, meta: { mime: string }): Promise<PutResult> {
    const sha256 = sha256Hex(bytes);
    const existing = await this.db.query.documentBlobs.findFirst({ where: eq(s.documentBlobs.sha256, sha256), columns: { id: true, size: true } });
    if (existing) return { storageKey: PREFIX + existing.id, size: existing.size, sha256 };

    const id = newId("blb");
    await this.db.insert(s.documentBlobs).values({ id, mime: meta.mime, size: bytes.byteLength, sha256, bytes });
    return { storageKey: PREFIX + id, size: bytes.byteLength, sha256 };
  }

  async get(storageKey: string): Promise<BlobContent | null> {
    const scheme = storageScheme(storageKey);
    if (scheme === "seed") return synthesizeSeedDocument(this.db, storageKey.slice(SEED_PREFIX.length));
    if (scheme !== "blob") return null;

    const row = await this.db.query.documentBlobs.findFirst({ where: eq(s.documentBlobs.id, storageKey.slice(PREFIX.length)) });
    return row ? { bytes: row.bytes, mime: row.mime, size: row.size, sha256: row.sha256 } : null;
  }

  async delete(storageKey: string): Promise<void> {
    if (storageScheme(storageKey) !== "blob") return;
    await this.db.delete(s.documentBlobs).where(eq(s.documentBlobs.id, storageKey.slice(PREFIX.length)));
  }
}
