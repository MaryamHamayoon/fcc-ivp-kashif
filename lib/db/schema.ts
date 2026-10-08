import { relations, sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  ACTIVITY_KINDS,
  CANDIDATE_DATE_STATUSES,
  DOCUMENT_KINDS,
  EXPERT_ROLES,
  EXPERT_STATUSES,
  INTERPRETER_MODES,
  MEETING_FORMATS,
  MEETING_STATUSES,
  ORG_KINDS,
  PARTICIPANT_CATEGORIES,
  PROPOSERS,
  ROLES,
  WAITING_ON,
} from "../domain/types"; // relative: drizzle-kit loads this file without tsconfig path aliases

/* ---------------------------------- enums ---------------------------------- */

export const meetingStatusEnum = pgEnum("meeting_status", MEETING_STATUSES);
export const meetingFormatEnum = pgEnum("meeting_format", MEETING_FORMATS);
export const expertStatusEnum = pgEnum("expert_status", EXPERT_STATUSES);
export const expertRoleEnum = pgEnum("expert_role", EXPERT_ROLES);
export const candidateDateStatusEnum = pgEnum("candidate_date_status", CANDIDATE_DATE_STATUSES);
export const proposerEnum = pgEnum("proposer", PROPOSERS);
export const participantCategoryEnum = pgEnum("participant_category", PARTICIPANT_CATEGORIES);
export const documentKindEnum = pgEnum("document_kind", DOCUMENT_KINDS);
export const activityKindEnum = pgEnum("activity_kind", ACTIVITY_KINDS);
export const waitingOnEnum = pgEnum("waiting_on", WAITING_ON);
export const userRoleEnum = pgEnum("user_role", ROLES);
export const orgKindEnum = pgEnum("org_kind", ORG_KINDS);
export const interpreterModeEnum = pgEnum("interpreter_mode", INTERPRETER_MODES);
export const bureauKindEnum = pgEnum("bureau_kind", ["bureau", "office"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

/**
 * Postgres bytea across both drivers. Parameters go out as a Buffer, which PGlite's serializer
 * takes as-is and the Neon HTTP driver turns into the `\x…` hex text form. Results come back
 * as a Uint8Array from PGlite and, depending on the driver's type parsing, as hex text from
 * Neon — both are normalized to a plain Uint8Array, so one column type serves file and sandbox.
 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer | string | Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => (typeof value === "string" ? Uint8Array.from(Buffer.from(value.replace(/^\\x/, ""), "hex")) : Uint8Array.from(value)),
});

/* ------------------------------ reference data ------------------------------ */

export const regions = pgTable("regions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const countries = pgTable("countries", {
  cca2: text("cca2").primaryKey(),
  cca3: text("cca3").notNull(),
  ccn3: text("ccn3").notNull(),
  name: text("name").notNull(),
  regionId: text("region_id")
    .notNull()
    .references(() => regions.id),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
});

export const bureaus = pgTable("bureaus", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  kind: bureauKindEnum("kind").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const topics = pgTable(
  "topics",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    parentId: text("parent_id").references((): AnyPgColumn => topics.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("topics_slug_idx").on(t.slug)],
);

/* --------------------------------- people --------------------------------- */

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** Acronym or short form shown in tight spaces and matched by search (ARTCI, Ofcom, MIC Japan). */
    shortName: text("short_name"),
    kind: orgKindEnum("kind").notNull().default("other"),
    countryCode: text("country_code").references(() => countries.cca2),
    website: text("website"),
    createdAt: createdAt(),
  },
  (t) => [index("organizations_country_idx").on(t.countryCode)],
);

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title"),
  organizationId: text("organization_id").references(() => organizations.id),
  email: text("email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: createdAt(),
});

/** Cached FCC Global Address Book rows (seeded in Phase 1, synced from Graph in Phase 4). */
export const staffDirectory = pgTable(
  "staff_directory",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    title: text("title"),
    bureauCode: text("bureau_code").references(() => bureaus.code),
    phone: text("phone"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("staff_email_idx").on(t.email), index("staff_bureau_idx").on(t.bureauCode)],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull(),
    staffId: text("staff_id").references(() => staffDirectory.id),
    bureauCode: text("bureau_code").references(() => bureaus.code),
    regionIds: jsonb("region_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    blurb: text("blurb"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/* -------------------------------- meetings -------------------------------- */

export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    fiscalYear: integer("fiscal_year").notNull(),
    sequence: integer("sequence").notNull(),
    title: text("title").notNull(),
    status: meetingStatusEnum("status").notNull().default("requested"),
    previousStatus: meetingStatusEnum("previous_status"),
    format: meetingFormatEnum("format").notNull().default("virtual"),
    regionId: text("region_id")
      .notNull()
      .references(() => regions.id),
    primaryCountryCode: text("primary_country_code")
      .notNull()
      .references(() => countries.cca2),
    organizationId: text("organization_id").references(() => organizations.id),
    requestorContactId: text("requestor_contact_id").references(() => contacts.id),
    leadUserId: text("lead_user_id").references(() => users.id),
    coordinatorUserId: text("coordinator_user_id").references(() => users.id),
    scheduledStart: ts("scheduled_start"),
    scheduledEnd: ts("scheduled_end"),
    timezone: text("timezone").notNull().default("America/New_York"),
    location: text("location"),
    virtualLink: text("virtual_link"),
    purpose: text("purpose"),
    ochAttending: boolean("och_attending").notNull().default(false),
    priority: text("priority").notNull().default("normal"),
    holdReason: text("hold_reason"),
    holdFollowUpAt: ts("hold_follow_up_at"),
    cancelReason: text("cancel_reason"),
    delegationSize: integer("delegation_size"),
    needsAv: boolean("needs_av").notNull().default(false),
    interpreter: interpreterModeEnum("interpreter").notNull().default("none"),
    accommodations: text("accommodations"),
    localContact: text("local_contact"),
    backgroundUrl: text("background_url"),
    viaIntermediary: text("via_intermediary"),
    requestedAt: ts("requested_at").notNull(),
    completedAt: ts("completed_at"),
    closedAt: ts("closed_at"),
    createdById: text("created_by_id").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("meetings_code_idx").on(t.code),
    index("meetings_status_idx").on(t.status),
    index("meetings_fy_idx").on(t.fiscalYear),
    index("meetings_scheduled_idx").on(t.scheduledStart),
    index("meetings_region_idx").on(t.regionId),
    index("meetings_country_idx").on(t.primaryCountryCode),
  ],
);

export const meetingCountries = pgTable(
  "meeting_countries",
  {
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.cca2),
  },
  (t) => [primaryKey({ columns: [t.meetingId, t.countryCode] })],
);

export const meetingCandidateDates = pgTable(
  "meeting_candidate_dates",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    start: ts("start").notNull(),
    end: ts("end"),
    proposedBy: proposerEnum("proposed_by").notNull(),
    status: candidateDateStatusEnum("status").notNull().default("proposed"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("candidate_dates_meeting_idx").on(t.meetingId)],
);

export const meetingTopics = pgTable(
  "meeting_topics",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id),
    rank: integer("rank").notNull().default(1),
    detail: text("detail"),
  },
  (t) => [index("meeting_topics_meeting_idx").on(t.meetingId), index("meeting_topics_topic_idx").on(t.topicId)],
);

export const meetingExperts = pgTable(
  "meeting_experts",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    staffId: text("staff_id")
      .notNull()
      .references(() => staffDirectory.id),
    bureauCode: text("bureau_code").references(() => bureaus.code),
    role: expertRoleEnum("role").notNull().default("briefer"),
    status: expertStatusEnum("status").notNull().default("tbd"),
    requestedAt: ts("requested_at"),
    respondedAt: ts("responded_at"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("meeting_experts_meeting_idx").on(t.meetingId), index("meeting_experts_staff_idx").on(t.staffId)],
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    title: text("title"),
    organizationId: text("organization_id").references(() => organizations.id),
    contactId: text("contact_id").references(() => contacts.id),
    category: participantCategoryEnum("category").notNull().default("foreign_gov"),
    isInterpreter: boolean("is_interpreter").notNull().default(false),
    attended: boolean("attended"),
  },
  (t) => [index("meeting_participants_meeting_idx").on(t.meetingId)],
);

export const meetingParticipantTotals = pgTable(
  "meeting_participant_totals",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    category: participantCategoryEnum("category").notNull(),
    planned: integer("planned").notNull().default(0),
    actual: integer("actual"),
  },
  (t) => [uniqueIndex("participant_totals_meeting_category_idx").on(t.meetingId, t.category)],
);

export const meetingDocuments = pgTable(
  "meeting_documents",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull(),
    title: text("title").notNull(),
    storageKey: text("storage_key"),
    version: integer("version").notNull().default(1),
    reusable: boolean("reusable").notNull().default(false),
    addedById: text("added_by_id").references(() => users.id),
    addedAt: ts("added_at").notNull().defaultNow(),
    /** As uploaded; what a download is called. Null for link-only metadata. */
    filename: text("filename"),
    mime: text("mime"),
    /** Bytes; null until the file is known (seeded documents are synthesized on request). */
    size: integer("size"),
    sha256: text("sha256"),
    /** Set when this row was created by "Reuse in a meeting"; the row it was copied from. */
    sourceDocumentId: text("source_document_id"),
  },
  (t) => [index("meeting_documents_meeting_idx").on(t.meetingId)],
);

/**
 * File bytes for uploads, behind the BlobStore seam (`blob://<id>`). One row per distinct
 * sha256, so a deck reused across three meetings is stored once. SharePoint takes this table's
 * place in Phase 4 without the metadata rows changing shape.
 */
export const documentBlobs = pgTable(
  "document_blobs",
  {
    id: text("id").primaryKey(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("document_blobs_sha256_idx").on(t.sha256)],
);

export const meetingAgendaItems = pgTable(
  "meeting_agenda_items",
  {
    id: text("id").primaryKey(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    title: text("title").notNull(),
    topicId: text("topic_id").references(() => topics.id),
    brieferStaffIds: jsonb("briefer_staff_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    notes: text("notes"),
  },
  (t) => [index("agenda_items_meeting_idx").on(t.meetingId)],
);

/* --------------------------- activity and audit --------------------------- */

export const activities = pgTable(
  "activities",
  {
    id: text("id").primaryKey(),
    /** Insertion order — breaks ties between entries logged at the same instant. */
    seq: bigserial("seq", { mode: "number" }).notNull(),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: activityKindEnum("kind").notNull().default("note"),
    body: text("body").notNull(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    authorId: text("author_id").references(() => users.id),
    waitingOn: waitingOnEnum("waiting_on").notNull().default("none"),
    waitingOnLabel: text("waiting_on_label"),
    nextAction: text("next_action"),
    nextActionDueAt: ts("next_action_due_at"),
    resolvedAt: ts("resolved_at"),
    resolvedById: text("resolved_by_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("activities_meeting_occurred_idx").on(t.meetingId, t.occurredAt), index("activities_waiting_idx").on(t.waitingOn, t.resolvedAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    userId: text("user_id").references(() => users.id),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);

export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
  shared: boolean("shared").notNull().default(false),
  createdAt: createdAt(),
});

/* -------------------------------- relations -------------------------------- */

export const regionsRelations = relations(regions, ({ many }) => ({ countries: many(countries), meetings: many(meetings) }));

export const countriesRelations = relations(countries, ({ one, many }) => ({
  region: one(regions, { fields: [countries.regionId], references: [regions.id] }),
  organizations: many(organizations),
  meetings: many(meetings),
}));

export const bureausRelations = relations(bureaus, ({ many }) => ({ staff: many(staffDirectory) }));

export const topicsRelations = relations(topics, ({ one, many }) => ({
  parent: one(topics, { fields: [topics.parentId], references: [topics.id], relationName: "topic_parent" }),
  children: many(topics, { relationName: "topic_parent" }),
  meetingTopics: many(meetingTopics),
}));

export const organizationsRelations = relations(organizations, ({ one, many }) => ({
  country: one(countries, { fields: [organizations.countryCode], references: [countries.cca2] }),
  contacts: many(contacts),
  meetings: many(meetings),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  organization: one(organizations, { fields: [contacts.organizationId], references: [organizations.id] }),
}));

export const staffDirectoryRelations = relations(staffDirectory, ({ one, many }) => ({
  bureau: one(bureaus, { fields: [staffDirectory.bureauCode], references: [bureaus.code] }),
  assignments: many(meetingExperts),
}));

export const usersRelations = relations(users, ({ one }) => ({
  staff: one(staffDirectory, { fields: [users.staffId], references: [staffDirectory.id] }),
  bureau: one(bureaus, { fields: [users.bureauCode], references: [bureaus.code] }),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  region: one(regions, { fields: [meetings.regionId], references: [regions.id] }),
  primaryCountry: one(countries, { fields: [meetings.primaryCountryCode], references: [countries.cca2] }),
  organization: one(organizations, { fields: [meetings.organizationId], references: [organizations.id] }),
  requestor: one(contacts, { fields: [meetings.requestorContactId], references: [contacts.id] }),
  lead: one(users, { fields: [meetings.leadUserId], references: [users.id], relationName: "meeting_lead" }),
  coordinator: one(users, { fields: [meetings.coordinatorUserId], references: [users.id], relationName: "meeting_coordinator" }),
  countries: many(meetingCountries),
  candidateDates: many(meetingCandidateDates),
  topics: many(meetingTopics),
  experts: many(meetingExperts),
  participants: many(meetingParticipants),
  participantTotals: many(meetingParticipantTotals),
  documents: many(meetingDocuments),
  agendaItems: many(meetingAgendaItems),
  activities: many(activities),
}));

export const meetingCountriesRelations = relations(meetingCountries, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingCountries.meetingId], references: [meetings.id] }),
  country: one(countries, { fields: [meetingCountries.countryCode], references: [countries.cca2] }),
}));

export const meetingCandidateDatesRelations = relations(meetingCandidateDates, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingCandidateDates.meetingId], references: [meetings.id] }),
}));

export const meetingTopicsRelations = relations(meetingTopics, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingTopics.meetingId], references: [meetings.id] }),
  topic: one(topics, { fields: [meetingTopics.topicId], references: [topics.id] }),
}));

export const meetingExpertsRelations = relations(meetingExperts, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingExperts.meetingId], references: [meetings.id] }),
  staff: one(staffDirectory, { fields: [meetingExperts.staffId], references: [staffDirectory.id] }),
  bureau: one(bureaus, { fields: [meetingExperts.bureauCode], references: [bureaus.code] }),
}));

export const meetingParticipantsRelations = relations(meetingParticipants, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingParticipants.meetingId], references: [meetings.id] }),
  organization: one(organizations, { fields: [meetingParticipants.organizationId], references: [organizations.id] }),
}));

export const meetingParticipantTotalsRelations = relations(meetingParticipantTotals, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingParticipantTotals.meetingId], references: [meetings.id] }),
}));

export const meetingDocumentsRelations = relations(meetingDocuments, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingDocuments.meetingId], references: [meetings.id] }),
  addedBy: one(users, { fields: [meetingDocuments.addedById], references: [users.id] }),
  source: one(meetingDocuments, { fields: [meetingDocuments.sourceDocumentId], references: [meetingDocuments.id], relationName: "document_source" }),
}));

export const meetingAgendaItemsRelations = relations(meetingAgendaItems, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingAgendaItems.meetingId], references: [meetings.id] }),
  topic: one(topics, { fields: [meetingAgendaItems.topicId], references: [topics.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  meeting: one(meetings, { fields: [activities.meetingId], references: [meetings.id] }),
  author: one(users, { fields: [activities.authorId], references: [users.id], relationName: "activity_author" }),
  resolvedBy: one(users, { fields: [activities.resolvedById], references: [users.id], relationName: "activity_resolver" }),
}));

export const savedViewsRelations = relations(savedViews, ({ one }) => ({
  owner: one(users, { fields: [savedViews.ownerId], references: [users.id] }),
}));
