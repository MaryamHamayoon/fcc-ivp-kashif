import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config. `npm run db:generate` diffs lib/db/schema.ts against drizzle/meta and
 * writes a new SQL migration, then scripts/bundle-migrations.mjs inlines every migration into
 * lib/db/migrations.generated.ts so the runtime migrator needs no filesystem access.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
