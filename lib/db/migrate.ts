import { sql } from "drizzle-orm";
import { execRows, type Db } from "./factory";
import { MIGRATIONS } from "./migrations.generated";

const BREAKPOINT = "--> statement-breakpoint";

/**
 * Applies any bundled migrations that have not been recorded in `ivp_migrations`.
 * Idempotent; safe to call on every boot. Returns the tags applied in this run.
 */
export async function runMigrations(db: Db): Promise<string[]> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS ivp_migrations (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const applied = new Set((await execRows<{ tag: string }>(db, sql`SELECT tag FROM ivp_migrations`)).map((r) => r.tag));

  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.tag)) continue;
    for (const statement of migration.sql.split(BREAKPOINT)) {
      const trimmed = statement.trim();
      if (trimmed) await db.execute(sql.raw(trimmed));
    }
    await db.execute(sql`INSERT INTO ivp_migrations (tag) VALUES (${migration.tag})`);
    ran.push(migration.tag);
  }
  return ran;
}
