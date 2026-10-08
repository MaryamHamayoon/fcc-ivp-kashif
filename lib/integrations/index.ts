import type { Db } from "@/lib/db/factory";
import { SeededAddressBook, type AddressBook } from "./address-book";
import { LocalBlobStore, type BlobStore } from "./blob-store";
import { LocalDocumentStore, type DocumentStore } from "./document-store";
import { LogNotifier, type Notifier } from "./notifier";

export * from "./address-book";
export * from "./blob-store";
export * from "./document-store";
export * from "./notifier";

export type Integrations = { addressBook: AddressBook; documentStore: DocumentStore; blobStore: BlobStore; notifier: Notifier };

/**
 * Every enterprise seam IVP needs, wired to its seeded/local implementation. Phase 4 swaps
 * these lines for adapters over the FCC Global Address Book, SharePoint (metadata and bytes)
 * and Teams/email — nothing that calls `getIntegrations` has to change.
 */
export function getIntegrations(db: Db): Integrations {
  return { addressBook: new SeededAddressBook(db), documentStore: new LocalDocumentStore(db), blobStore: new LocalBlobStore(db), notifier: new LogNotifier() };
}
