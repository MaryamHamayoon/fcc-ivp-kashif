import type { PGlite } from "@electric-sql/pglite";
import { createPgliteDb, type PgliteDb } from "./factory";
import { runMigrations } from "./migrate";

export type TestDb = { db: PgliteDb; client: PGlite; close: () => Promise<void> };

/** A fresh, fully migrated in-memory database for tests. Call `close()` in `finally`. */
export async function createTestDb(): Promise<TestDb> {
  const { db, client } = await createPgliteDb();
  await runMigrations(db);
  return { db, client, close: () => client.close() };
}
