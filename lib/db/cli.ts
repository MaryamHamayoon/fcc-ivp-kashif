// Database maintenance CLI: `npm run db:migrate | db:seed | db:reset`. Reads .env.local like Next does.
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { describeSummary, seedAll, seedIfEmpty } from "../../db/seed";
import { createNeonDb, createPgliteDb, type Db } from "./factory";
import { runMigrations } from "./migrate";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const command = process.argv[2] ?? "migrate";
const driver = process.env.DB_DRIVER ?? "pglite";
const pgliteDir = process.env.PGLITE_DIR ?? ".pglite";

async function open(): Promise<{ db: Db; close: () => Promise<void> }> {
  if (driver === "neon") {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required when DB_DRIVER=neon");
    return { db: createNeonDb(url), close: async () => {} };
  }
  const { db, client } = await createPgliteDb(driver === "pglite-memory" ? undefined : pgliteDir);
  return { db, close: () => client.close() };
}

async function main() {
  if (!["migrate", "seed", "reset"].includes(command)) throw new Error(`Unknown command "${command}" (expected migrate, seed or reset)`);
  if (command === "reset") {
    if (driver !== "pglite") throw new Error("db:reset only supports the local PGlite driver");
    await rm(pgliteDir, { recursive: true, force: true });
    console.log(`Removed ${pgliteDir}`);
  }
  const { db, close } = await open();
  try {
    const ran = await runMigrations(db);
    console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "Migrations already up to date");
    if (command === "reset") {
      console.log(describeSummary(await seedAll(db)));
    } else if (command === "seed") {
      const seeded = await seedIfEmpty(db);
      console.log(seeded ? "Seeded the empty database" : "Database already has data; nothing seeded (use db:reset to start over)");
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
