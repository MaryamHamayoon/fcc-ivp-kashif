import type { Db } from "@/lib/db/factory";
import { makeDirectoryRepo, type StaffFilters } from "@/lib/db/repos/directory";

/**
 * The FCC Global Address Book, as IVP sees it. In Phase 1 this is the cached
 * `staff_directory` table (seeded); Phase 4 swaps `SeededAddressBook` for an adapter
 * over Microsoft Graph without touching a single caller of this interface.
 */
export type AddressBookEntry = {
  id: string;
  name: string;
  title: string | null;
  email: string;
  bureauCode: string | null;
  bureauName: string | null;
  phone?: string | null;
};

export interface AddressBook {
  /** Free-text match on name, email and title; `bureauCode` and `limit` narrow the result. */
  search(q: string, opts?: { bureauCode?: string; limit?: number }): Promise<AddressBookEntry[]>;
  get(id: string): Promise<AddressBookEntry | null>;
}

type StaffWithBureau = { id: string; name: string; title: string | null; email: string; bureauCode: string | null; phone: string | null; bureau?: { name: string } | null };

function toEntry(row: StaffWithBureau): AddressBookEntry {
  return { id: row.id, name: row.name, title: row.title, email: row.email, bureauCode: row.bureauCode, bureauName: row.bureau?.name ?? null, phone: row.phone };
}

/** Backed by the seeded `staff_directory` table via the directory repo. */
export class SeededAddressBook implements AddressBook {
  constructor(private readonly db: Db) {}

  async search(q: string, opts: { bureauCode?: string; limit?: number } = {}): Promise<AddressBookEntry[]> {
    const filters: StaffFilters = { q: q.trim() || undefined, bureauCode: opts.bureauCode };
    const rows = await makeDirectoryRepo(this.db).listStaff(filters);
    const limited = opts.limit ? rows.slice(0, opts.limit) : rows;
    return limited.map(toEntry);
  }

  async get(id: string): Promise<AddressBookEntry | null> {
    const row = await makeDirectoryRepo(this.db).getStaff(id);
    return row ? toEntry(row) : null;
  }
}
