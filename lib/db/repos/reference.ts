import { asc, eq } from "drizzle-orm";
import type { Db } from "../factory";
import * as s from "../schema";

/** Small, rarely changing lookups. */
export function makeReferenceRepo(db: Db) {
  return {
    regions: () => db.select().from(s.regions).orderBy(asc(s.regions.sortOrder)),
    countries: () => db.query.countries.findMany({ with: { region: true }, orderBy: (c, { asc }) => [asc(c.name)] }),
    country: (code: string) => db.query.countries.findFirst({ where: eq(s.countries.cca2, code.toUpperCase()), with: { region: true } }),
    topics: () => db.query.topics.findMany({ orderBy: (t, { asc }) => [asc(t.sortOrder)] }),
    bureaus: () => db.select().from(s.bureaus).orderBy(asc(s.bureaus.sortOrder)),
    users: () => db.query.users.findMany({ where: eq(s.users.active, true), with: { staff: true, bureau: true }, orderBy: (u, { asc }) => [asc(u.name)] }),
    user: (id: string) => db.query.users.findFirst({ where: eq(s.users.id, id), with: { staff: true, bureau: true } }),
  };
}

export type ReferenceRepo = ReturnType<typeof makeReferenceRepo>;
