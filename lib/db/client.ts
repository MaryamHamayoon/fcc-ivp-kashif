import "server-only";
import { createNeonDb, createPgliteDb, type Db } from "./factory";
import { runMigrations } from "./migrate";

/**
 * Process-wide database singleton for the Next.js server.
 *
 *   DB_DRIVER=pglite         embedded Postgres persisted under PGLITE_DIR (default .pglite) — local dev
 *   DB_DRIVER=pglite-memory  embedded Postgres in memory, rebuilt on every server start — sandbox deploys
 *   DB_DRIVER=neon           Neon serverless Postgres at DATABASE_URL — persistent deploys
 *
 * Migrations run on first use. The promise is cached on globalThis so Next's dev-mode module
 * reloads reuse one PGlite instance instead of opening the data directory twice.
 */

type Driver = "pglite" | "pglite-memory" | "neon";

declare global {
  var __ivpDb: Promise<Db> | undefined;
}

export function currentDriver(): Driver {
  const raw = process.env.DB_DRIVER ?? "pglite";
  if (raw === "pglite" || raw === "pglite-memory" || raw === "neon") return raw;
  throw new Error(`Unknown DB_DRIVER "${raw}" (expected pglite, pglite-memory or neon)`);
}

/** True when data lives only in this process — the UI shows a "sandbox, data resets" notice. */
export function isEphemeralDb(): boolean {
  return currentDriver() === "pglite-memory";
}

async function boot(): Promise<Db> {
  const driver = currentDriver();
  if (driver === "neon") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DB_DRIVER=neon");
    const db = createNeonDb(url);
    await runMigrations(db);
    return db;
  }
  const dir = driver === "pglite" ? (process.env.PGLITE_DIR ?? ".pglite") : undefined;
  const { db } = await createPgliteDb(dir);
  await runMigrations(db);
  if (driver === "pglite-memory" || process.env.DB_SEED_ON_BOOT === "true") {
    const { seedIfEmpty } = await import("@/db/seed");
    await seedIfEmpty(db);
  }
  return db;
}

export function getDb(): Promise<Db> {
  globalThis.__ivpDb ??= boot().catch((error: unknown) => {
    globalThis.__ivpDb = undefined; // let the next request retry instead of caching the failure
    throw error;
  });
  return globalThis.__ivpDb;
}
