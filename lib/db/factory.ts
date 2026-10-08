import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { neon } from "@neondatabase/serverless";
import type { SQL } from "drizzle-orm";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Schema = typeof schema;

/** Driver-agnostic database handle. Repositories and services depend only on this type. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type PgliteDb = PgliteDatabase<Schema>;
export type NeonDb = NeonHttpDatabase<Schema>;

/**
 * Embedded Postgres (WASM). `dir` persists to disk (local dev); omit it for an in-memory
 * database (tests, demo deployments). pg_trgm is loaded so fuzzy search works everywhere.
 */
export async function createPgliteDb(dir?: string): Promise<{ db: PgliteDb; client: PGlite }> {
  const client = await PGlite.create({ dataDir: dir ?? "memory://", extensions: { pg_trgm } });
  const db = drizzlePglite({ client, schema });
  return { db, client };
}

/** Neon serverless Postgres over HTTP — the persistent option for hosted deployments. */
export function createNeonDb(url: string): NeonDb {
  return drizzleNeon({ client: neon(url), schema });
}

/** Run a raw query and return its rows, uniformly across drivers. */
export async function execRows<T extends Record<string, unknown>>(db: Db, query: SQL): Promise<T[]> {
  const result = await db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
}
