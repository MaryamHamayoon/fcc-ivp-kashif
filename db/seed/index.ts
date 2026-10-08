import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as s from "../../lib/db/schema";
import type { Db } from "../../lib/db/factory";
import { generateSeed, type SeedGraph, type SeedOptions } from "./generate";

export { DEMO_USERS, generateSeed, type DemoUser, type SeedGraph, type SeedOptions } from "./generate";

export type SeedSummary = Record<keyof SeedGraph, number>;

const CHUNK = 400;

async function insertAll<T extends PgTable>(db: Db, table: T, rows: T["$inferInsert"][]): Promise<number> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(table).values(rows.slice(i, i + CHUNK) as T["$inferInsert"][]);
  }
  return rows.length;
}

/** Inserts the generated graph in dependency order. Assumes an empty (freshly migrated) database. */
export async function seedAll(db: Db, opts: SeedOptions = {}): Promise<SeedSummary> {
  const g = generateSeed(opts);
  return {
    regions: await insertAll(db, s.regions, g.regions),
    countries: await insertAll(db, s.countries, g.countries),
    bureaus: await insertAll(db, s.bureaus, g.bureaus),
    topics: await insertAll(db, s.topics, g.topics),
    organizations: await insertAll(db, s.organizations, g.organizations),
    contacts: await insertAll(db, s.contacts, g.contacts),
    staff: await insertAll(db, s.staffDirectory, g.staff),
    users: await insertAll(db, s.users, g.users),
    meetings: await insertAll(db, s.meetings, g.meetings),
    meetingCountries: await insertAll(db, s.meetingCountries, g.meetingCountries),
    candidateDates: await insertAll(db, s.meetingCandidateDates, g.candidateDates),
    meetingTopics: await insertAll(db, s.meetingTopics, g.meetingTopics),
    experts: await insertAll(db, s.meetingExperts, g.experts),
    participants: await insertAll(db, s.meetingParticipants, g.participants),
    participantTotals: await insertAll(db, s.meetingParticipantTotals, g.participantTotals),
    documents: await insertAll(db, s.meetingDocuments, g.documents),
    agendaItems: await insertAll(db, s.meetingAgendaItems, g.agendaItems),
    activities: await insertAll(db, s.activities, g.activities),
  };
}

/** Seeds only when the database has no users. Returns true when it seeded. */
export async function seedIfEmpty(db: Db, opts: SeedOptions = {}): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(s.users);
  if ((row?.n ?? 0) > 0) return false;
  await seedAll(db, opts);
  return true;
}

export function describeSummary(summary: SeedSummary): string {
  return Object.entries(summary)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");
}
