import { z } from "zod";
import { ACTIVITY_WINDOWS } from "@/lib/domain/activity-feed";
import type { PreviewKind, StorageScheme } from "@/lib/domain/documents";
import type { ReadinessKey } from "@/lib/domain/readiness";
import { CUSTOM_MEASURES, CUSTOM_ROWS } from "@/lib/domain/reports";
import { MEETING_VIEWS, type MeetingView } from "@/lib/domain/status-machine";
import {
  ACTIVITY_KINDS,
  EXPERT_ROLES,
  EXPERT_STATUSES,
  INTERPRETER_MODES,
  MEETING_FORMATS,
  MEETING_STATUSES,
  ORG_KINDS,
  PARTICIPANT_CATEGORIES,
  PRIORITIES,
  PROPOSERS,
  WAITING_ON,
  type WaitingOn,
} from "@/lib/domain/types";
import type { AgeBand } from "@/lib/domain/waiting-on";
import { MEETINGS_PAGE_SIZE } from "@/lib/url-state";

/** Query-string booleans: "true"/"1" → true, "false"/"0" → false (z.coerce.boolean treats "false" as true). */
const boolParam = z
  .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
  .transform((v) => v === true || v === "true" || v === "1");

export { MEETING_VIEWS, type MeetingView } from "@/lib/domain/status-machine";
export const MEETING_SORTS = ["date", "updated", "country", "status", "readiness"] as const;
export type MeetingSort = (typeof MEETING_SORTS)[number];

export const MeetingListQuery = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.array(z.enum(MEETING_STATUSES)).optional(),
  regionId: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  fy: z.coerce.number().int().optional(),
  format: z.enum(MEETING_FORMATS).optional(),
  leadUserId: z.string().optional(),
  bureauCode: z.string().optional(),
  topicId: z.string().optional(),
  och: boolParam.optional(),
  waiting: z.enum(WAITING_ON).optional(),
  view: z.enum(MEETING_VIEWS).default("active"),
  sort: z.enum(MEETING_SORTS).default("date"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(MEETINGS_PAGE_SIZE),
});
export type MeetingListQueryInput = z.infer<typeof MeetingListQuery>;

/** Filters that may appear more than once in the URL. */
const MEETING_LIST_MULTI_KEYS = new Set(["status"]);

/**
 * URLSearchParams → a plain object a list schema can parse. Multi-value keys arrive either
 * repeated (`status=confirmed&status=clearance`) or comma-separated (`status=confirmed,clearance`),
 * because links are written by hand as often as by the UI. Empty values are dropped so
 * `/meetings?fy=` falls back to the defaults instead of failing validation.
 */
function collectParams(params: URLSearchParams, multiKeys: ReadonlySet<string>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!multiKeys.has(key)) {
      raw[key] = trimmed;
      continue;
    }
    const parts = trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) continue;
    const existing = raw[key];
    raw[key] = Array.isArray(existing) ? [...existing, ...parts] : parts;
  }
  return raw;
}

export function parseMeetingListQuery(params: URLSearchParams) {
  return MeetingListQuery.safeParse(collectParams(params, MEETING_LIST_MULTI_KEYS));
}

/* ---------------------------- list response ------------------------------- */

/** Mirrors of domain unions that the wire format has to spell out; `satisfies` keeps them honest. */
const READINESS_KEYS = ["dates", "experts", "agenda", "materials", "participants", "logistics"] as const satisfies readonly ReadinessKey[];
const AGE_BANDS = ["ok", "warn", "alert"] as const satisfies readonly AgeBand[];
const WAITING_PARTIES = ["visitor", "expert", "internal", "och"] as const satisfies readonly Exclude<WaitingOn, "none">[];

const ReadinessItemSchema = z.object({ key: z.enum(READINESS_KEYS), label: z.string(), done: z.boolean(), detail: z.string() });

const ReadinessSchema = z.object({
  percent: z.number(),
  items: z.array(ReadinessItemSchema),
  missing: z.array(ReadinessItemSchema),
  isReady: z.boolean(),
});

const WaitingStateSchema = z.object({
  who: z.enum(WAITING_PARTIES),
  label: z.string(),
  since: z.coerce.date(),
  businessDays: z.number(),
  band: z.enum(AGE_BANDS),
  activityId: z.string(),
  nextAction: z.string().nullable(),
  nextActionDueAt: z.coerce.date().nullable(),
});

/** One row of `/api/meetings` — the repository's list item after a JSON round trip. */
export const MeetingListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  status: z.enum(MEETING_STATUSES),
  previousStatus: z.enum(MEETING_STATUSES).nullable(),
  format: z.enum(MEETING_FORMATS),
  regionId: z.string(),
  regionName: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
  countryCodes: z.array(z.string()),
  orgId: z.string().nullable(),
  orgName: z.string(),
  orgShortName: z.string().nullable(),
  leadUserId: z.string().nullable(),
  leadName: z.string().nullable(),
  coordinatorName: z.string().nullable(),
  scheduledStart: z.coerce.date().nullable(),
  scheduledEnd: z.coerce.date().nullable(),
  nextCandidate: z.coerce.date().nullable(),
  candidateDates: z.array(z.object({ id: z.string(), start: z.coerce.date(), end: z.coerce.date().nullable(), status: z.string(), proposedBy: z.string() })),
  topics: z.array(z.object({ id: z.string(), name: z.string() })),
  experts: z.array(z.object({ id: z.string(), staffId: z.string(), name: z.string(), bureauCode: z.string().nullable(), status: z.enum(EXPERT_STATUSES), role: z.enum(EXPERT_ROLES) })),
  readiness: ReadinessSchema,
  waiting: WaitingStateSchema.nullable(),
  ochAttending: z.boolean(),
  priority: z.string(),
  fiscalYear: z.number().int(),
  delegationSize: z.number().int().nullable(),
  participantTotal: z.number().int(),
  holdFollowUpAt: z.coerce.date().nullable(),
  requestedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type MeetingListItemDto = z.infer<typeof MeetingListItemSchema>;

export const MeetingListResponse = z.object({
  items: z.array(MeetingListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type MeetingListResponse = z.infer<typeof MeetingListResponse>;

/** `/api/meetings/counts`: how many meetings each scope holds under the list's other filters. One key per scope, derived, so adding a scope cannot silently fail to parse. */
export const MeetingCountsResponse = z.object({
  counts: z.object(Object.fromEntries(MEETING_VIEWS.map((view) => [view, z.number().int()])) as Record<MeetingView, z.ZodNumber>),
});
export type MeetingCounts = z.infer<typeof MeetingCountsResponse>["counts"];

/** Enough of a meeting to pick one — the reuse dialog's search results; the rest of the row is dropped. */
export const MeetingPickSchema = MeetingListItemSchema.pick({ id: true, code: true, title: true, status: true, countryCode: true, countryName: true, orgName: true, orgShortName: true, scheduledStart: true });
export type MeetingPick = z.infer<typeof MeetingPickSchema>;
export const MeetingPickResponse = z.object({ items: z.array(MeetingPickSchema) });

export const CreateMeetingInput = z.object({
  requestor: z.object({
    name: z.string().trim().min(2).max(120),
    title: z.string().trim().max(120).optional(),
    organizationName: z.string().trim().min(2).max(200),
    organizationKind: z.enum(ORG_KINDS),
    email: z.string().trim().email(),
    phone: z.string().trim().max(40).optional(),
    viaIntermediary: z.string().trim().max(200).optional(),
  }),
  countryCodes: z.array(z.string().length(2)).min(1),
  regionId: z.string().min(1),
  leadUserId: z.string().optional(),
  delegation: z.object({
    headline: z.string().trim().min(3).max(200),
    purpose: z.string().trim().max(4000).optional(),
    size: z.number().int().min(1).max(60),
    members: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          title: z.string().trim().max(120).optional(),
          category: z.enum(PARTICIPANT_CATEGORIES).default("foreign_gov"),
          isInterpreter: z.boolean().default(false),
        }),
      )
      .default([]),
  }),
  topics: z.array(z.object({ topicId: z.string().min(1), detail: z.string().trim().max(500).optional() })).min(1),
  dates: z
    .object({
      preferredStart: z.coerce.date(),
      preferredEnd: z.coerce.date().optional(),
      alternateStart: z.coerce.date().optional(),
      format: z.enum(MEETING_FORMATS),
      timezone: z.string().default("America/New_York"),
    })
    .refine((d) => !d.alternateStart || d.alternateStart.getTime() > d.preferredStart.getTime(), {
      message: "The alternate date must come after the preferred date.",
      path: ["alternateStart"],
    })
    .refine((d) => !d.preferredEnd || d.preferredEnd.getTime() > d.preferredStart.getTime(), {
      message: "The end time must come after the start time.",
      path: ["preferredEnd"],
    }),
  logistics: z
    .object({
      needsAv: z.boolean().default(false),
      interpreter: z.enum(INTERPRETER_MODES).default("none"),
      accommodations: z.string().trim().max(1000).optional(),
      localContact: z.string().trim().max(300).optional(),
      backgroundUrl: z.string().trim().url().optional().or(z.literal("").transform(() => undefined)),
    })
    .prefault({}),
  ochRequested: z.boolean().default(false),
});
export type CreateMeetingInput = z.infer<typeof CreateMeetingInput>;
export type CreateMeetingInputRaw = z.input<typeof CreateMeetingInput>;

export const LogActivityInput = z.object({
  meetingId: z.string().min(1),
  kind: z.enum(ACTIVITY_KINDS).default("note"),
  body: z.string().trim().min(1).max(4000),
  occurredAt: z.coerce.date().optional(),
  waitingOn: z.enum(WAITING_ON).default("none"),
  waitingOnLabel: z.string().trim().max(120).optional(),
  nextAction: z.string().trim().max(300).optional(),
  nextActionDueAt: z.coerce.date().optional(),
  resolvesActivityId: z.string().optional(),
});
export type LogActivityInput = z.infer<typeof LogActivityInput>;
export type LogActivityInputRaw = z.input<typeof LogActivityInput>;

export const TransitionInput = z.object({
  meetingId: z.string().min(1),
  to: z.enum(MEETING_STATUSES),
  holdReason: z.string().trim().max(500).optional(),
  holdFollowUpAt: z.coerce.date().optional(),
  cancelReason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(2000).optional(),
});
export type TransitionInput = z.infer<typeof TransitionInput>;

export const CandidateDateInput = z.object({
  meetingId: z.string().min(1),
  start: z.coerce.date(),
  end: z.coerce.date().optional(),
  proposedBy: z.enum(PROPOSERS),
  note: z.string().trim().max(300).optional(),
});
export type CandidateDateInput = z.infer<typeof CandidateDateInput>;

export const ExpertInput = z.object({
  meetingId: z.string().min(1),
  staffId: z.string().min(1),
  role: z.enum(EXPERT_ROLES).default("briefer"),
});
export type ExpertInput = z.infer<typeof ExpertInput>;
export type ExpertInputRaw = z.input<typeof ExpertInput>;

export const ExpertRespondInput = z.object({
  meetingExpertId: z.string().min(1),
  status: z.enum(["confirmed", "declined"]),
  note: z.string().trim().max(500).optional(),
});
export type ExpertRespondInput = z.infer<typeof ExpertRespondInput>;

export const SearchQuery = z.object({ q: z.string().trim().min(2).max(80), limit: z.coerce.number().int().min(1).max(50).default(20) });

export const SearchHitSchema = z.object({
  kind: z.enum(["meeting", "organization", "country", "staff", "topic", "activity", "document"]),
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  href: z.string(),
  score: z.number(),
  countryCode: z.string().optional(),
  status: z.enum(MEETING_STATUSES).optional(),
});
export const SearchResponse = z.object({ hits: z.array(SearchHitSchema) });
export type SearchResponse = z.infer<typeof SearchResponse>;

/* -------------------------- meeting record tabs --------------------------- */

// Declared here rather than in the head of the file so this shared module's imports stay
// stable while other work reads it; ES imports are hoisted, so the position is immaterial.
import { DOCUMENT_KINDS } from "@/lib/domain/types";

/**
 * What every server action under `/meetings/[id]` returns. A failure is a value, not an
 * exception, so a form renders the reason beside the control that caused it.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };
export type ActionResultWith<T> = ({ ok: true } & T) | { ok: false; error: string };

/** A child row plus the meeting whose pages the action has to revalidate. */
export const MeetingChildRef = z.object({ meetingId: z.string().min(1), id: z.string().min(1) });
export type MeetingChildRef = z.infer<typeof MeetingChildRef>;

/** Recording an expert's answer needs the meeting too, so the record's pages can be refreshed. */
export const ExpertRespondActionInput = ExpertRespondInput.extend({ meetingId: z.string().min(1) });
export type ExpertRespondActionInput = z.infer<typeof ExpertRespondActionInput>;

/** Address-book lookup behind the "Add expert" combobox. */
export const AddressBookQuery = z.object({
  q: z.string().trim().max(80).default(""),
  bureauCode: z.string().trim().max(16).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AddressBookQuery = z.infer<typeof AddressBookQuery>;

/** Declining a proposed date may carry the reason the other side gave. */
export const DeclineDateInput = MeetingChildRef.extend({ note: z.string().trim().max(300).optional() });
export type DeclineDateInput = z.infer<typeof DeclineDateInput>;

/** One named person in the room. Counts without names live in `ParticipantTotalsInput`. */
export const ParticipantInput = z.object({
  meetingId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  title: z.string().trim().max(120).optional(),
  category: z.enum(PARTICIPANT_CATEGORIES).default("foreign_gov"),
  isInterpreter: z.boolean().default(false),
  organizationId: z.string().min(1).optional(),
});
export type ParticipantInput = z.infer<typeof ParticipantInput>;
export type ParticipantInputRaw = z.input<typeof ParticipantInput>;

const headcount = z.coerce.number().int().min(0).max(999);

/**
 * Headcounts per category — planned while the visit is being built, actual once it has
 * happened. The annual report asks for both, and the gap between them is what OIA gets asked
 * about, so `actual` stays null rather than defaulting to the plan.
 */
export const ParticipantTotalsInput = z.object({
  meetingId: z.string().min(1),
  totals: z
    .array(z.object({ category: z.enum(PARTICIPANT_CATEGORIES), planned: headcount.default(0), actual: headcount.nullable().default(null) }))
    .min(1)
    .max(PARTICIPANT_CATEGORIES.length),
});
export type ParticipantTotalsInput = z.infer<typeof ParticipantTotalsInput>;
export type ParticipantTotalsInputRaw = z.input<typeof ParticipantTotalsInput>;

/** One timed agenda block; `id` present means edit rather than add. */
export const AgendaItemInput = z
  .object({
    meetingId: z.string().min(1),
    id: z.string().min(1).optional(),
    title: z.string().trim().min(2).max(200),
    startsAt: z.coerce.date().nullish(),
    endsAt: z.coerce.date().nullish(),
    topicId: z.string().min(1).nullish(),
    brieferStaffIds: z.array(z.string().min(1)).max(12).default([]),
    notes: z.string().trim().max(1000).nullish(),
  })
  .refine((a) => !a.startsAt || !a.endsAt || a.endsAt.getTime() > a.startsAt.getTime(), { message: "The end must come after the start.", path: ["endsAt"] });
export type AgendaItemInput = z.infer<typeof AgendaItemInput>;
export type AgendaItemInputRaw = z.input<typeof AgendaItemInput>;

export const AgendaReorderInput = z.object({ meetingId: z.string().min(1), orderedIds: z.array(z.string().min(1)).min(1).max(60) });
export type AgendaReorderInput = z.infer<typeof AgendaReorderInput>;

/** Document *metadata*: Phase 1 records what exists and where it lives, never the bytes. */
export const DocumentInput = z.object({
  meetingId: z.string().min(1),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().trim().min(2).max(200),
  version: z.coerce.number().int().min(1).max(99).optional(),
  reusable: z.boolean().default(false),
  storageKey: z.string().trim().max(500).nullish(),
});
export type DocumentInput = z.infer<typeof DocumentInput>;
export type DocumentInputRaw = z.input<typeof DocumentInput>;

/** The reusable star: a document worth pulling into the next visit on the same topic. */
export const DocumentReusableInput = MeetingChildRef.extend({ reusable: z.boolean() });
export type DocumentReusableInput = z.infer<typeof DocumentReusableInput>;

/** Room, link and access — the half of the record a briefer actually needs on the day. */
export const LogisticsInput = z.object({
  meetingId: z.string().min(1),
  location: z.string().trim().max(300).nullish(),
  virtualLink: z.string().trim().max(500).nullish(),
  needsAv: z.boolean().default(false),
  interpreter: z.enum(INTERPRETER_MODES).default("none"),
  accommodations: z.string().trim().max(1000).nullish(),
  localContact: z.string().trim().max(300).nullish(),
});
export type LogisticsInput = z.infer<typeof LogisticsInput>;
export type LogisticsInputRaw = z.input<typeof LogisticsInput>;

/* ------------------------------ meeting edit page --------------------------- */

/**
 * The request essentials, ownership and ranked topic list the Edit page can change in one
 * save. `topicIds` carries the chosen order — the service turns position into rank.
 */
export const UpdateMeetingInput = z
  .object({
    meetingId: z.string().min(1),
    title: z.string().trim().min(2, "Enter at least 2 characters.").max(200, "Keep the title under 200 characters."),
    purpose: z.string().trim().min(10, "Say a little more about why they asked — at least 10 characters.").max(2000, "Keep the purpose under 2000 characters."),
    format: z.enum(MEETING_FORMATS),
    ochAttending: z.boolean(),
    priority: z.enum(PRIORITIES),
    delegationSize: z.coerce.number("Enter the delegation size.").int().min(1, "Enter at least 1 visitor.").max(200, "200 is the most this can hold."),
    leadUserId: z.string().min(1).nullish(),
    coordinatorUserId: z.string().min(1).nullish(),
    topicIds: z.array(z.string().min(1)).min(1, "Choose at least one topic.").max(8, "Choose up to 8 topics."),
  })
  .refine((d) => new Set(d.topicIds).size === d.topicIds.length, { message: "Each topic can only be chosen once.", path: ["topicIds"] });
export type UpdateMeetingInput = z.infer<typeof UpdateMeetingInput>;
export type UpdateMeetingInputRaw = z.input<typeof UpdateMeetingInput>;

/* ---------------------------- document library (Phase 2) ---------------------------- */

export const DOCUMENT_SORTS = ["newest", "title", "meeting"] as const;
export type DocumentSort = (typeof DOCUMENT_SORTS)[number];

/** Mirrors of `lib/domain/documents` unions the wire format has to spell out. */
const PREVIEW_KINDS = ["pdf", "image", "text"] as const satisfies readonly PreviewKind[];
const STORAGE_SCHEMES = ["blob", "seed", "link", "none"] as const satisfies readonly StorageScheme[];

export const DocumentLibraryQuery = z.object({
  q: z.string().trim().max(120).optional(),
  kind: z.enum(DOCUMENT_KINDS).optional(),
  topicId: z.string().optional(),
  countryCode: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase())
    .optional(),
  regionId: z.string().optional(),
  orgId: z.string().optional(),
  fy: z.coerce.number().int().optional(),
  status: z.array(z.enum(MEETING_STATUSES)).optional(),
  reusable: boolParam.optional(),
  sort: z.enum(DOCUMENT_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});
export type DocumentLibraryQueryInput = z.infer<typeof DocumentLibraryQuery>;

export function parseDocumentLibraryQuery(params: URLSearchParams) {
  return DocumentLibraryQuery.safeParse(collectParams(params, MEETING_LIST_MULTI_KEYS));
}

/* --------------------------------- activity -------------------------------- */

export const ACTIVITY_SCOPES = ["all", "open", "mine"] as const;
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];
export const ACTIVITY_SORTS = ["newest", "oldest"] as const;
export type ActivitySort = (typeof ACTIVITY_SORTS)[number];

export const ActivityFeedQuery = z.object({
  /** all, only waits still open, or only what the reader logged themselves. */
  scope: z.enum(ACTIVITY_SCOPES).default("all"),
  q: z.string().trim().max(120).optional(),
  kind: z.array(z.enum(ACTIVITY_KINDS)).optional(),
  /** Who the wait is on; "nobody" is simply the filter's absence. */
  waitingOn: z.enum(WAITING_PARTIES).optional(),
  authorId: z.string().optional(),
  regionId: z.string().optional(),
  fy: z.coerce.number().int().optional(),
  status: z.array(z.enum(MEETING_STATUSES)).optional(),
  when: z.enum(ACTIVITY_WINDOWS).optional(),
  /** One week of the pulse, as the date of its Monday. */
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sort: z.enum(ACTIVITY_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
});
export type ActivityFeedQueryInput = z.infer<typeof ActivityFeedQuery>;

const ACTIVITY_MULTI_KEYS = new Set(["kind", "status"]);

export function parseActivityFeedQuery(params: URLSearchParams) {
  return ActivityFeedQuery.safeParse(collectParams(params, ACTIVITY_MULTI_KEYS));
}

/** One row of `/api/activity` — the repository's feed item after a JSON round trip. */
export const ActivityFeedItemSchema = z.object({
  id: z.string(),
  kind: z.enum(ACTIVITY_KINDS),
  body: z.string(),
  occurredAt: z.coerce.date(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  waitingOn: z.enum(WAITING_ON),
  waitingOnLabel: z.string().nullable(),
  nextAction: z.string().nullable(),
  nextActionDueAt: z.coerce.date().nullable(),
  resolvedAt: z.coerce.date().nullable(),
  resolvedByName: z.string().nullable(),
  meetingId: z.string(),
  meetingCode: z.string(),
  meetingTitle: z.string(),
  meetingStatus: z.enum(MEETING_STATUSES),
  orgName: z.string(),
  countryCode: z.string(),
  countryName: z.string(),
});
export type ActivityFeedItemDto = z.infer<typeof ActivityFeedItemSchema>;

export const ActivityFeedResponse = z.object({
  items: z.array(ActivityFeedItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  /** What each scope tab would show under the filters in force. */
  counts: z.object({ all: z.number().int(), open: z.number().int(), mine: z.number().int() }),
  /** Entries per week under the same filters, the time filters aside; oldest week first. */
  pulse: z.array(z.object({ week: z.string(), count: z.number().int() })),
});
export type ActivityFeedResponse = z.infer<typeof ActivityFeedResponse>;

/* --------------------------------- reports --------------------------------- */

export const REPORTS = ["summary", "tally", "participants", "experts", "countries", "tracker", "custom"] as const;
export type ReportId = (typeof REPORTS)[number];

export const REPORT_LABELS: Record<ReportId, string> = {
  summary: "Program summary",
  tally: "Fiscal-year tally",
  participants: "Participants",
  experts: "Experts & bureaus",
  countries: "Countries",
  tracker: "Tracker",
  custom: "Custom",
};

/**
 * `/reports` and its exports read the same query: the report, the fiscal year (the current
 * one when absent), the meetings list's filter vocabulary, and the custom report's two
 * choices. A report's URL therefore reads like a meetings URL, and an export link carries
 * exactly what the page showed.
 */
export const ReportQuery = z.object({
  fy: z.coerce.number().int().min(2000).max(2100).optional(),
  report: z.enum(REPORTS).default("summary"),
  regionId: z.string().optional(),
  countryCode: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase())
    .optional(),
  topicId: z.string().optional(),
  format: z.enum(MEETING_FORMATS).optional(),
  bureauCode: z.string().optional(),
  status: z.array(z.enum(MEETING_STATUSES)).optional(),
  leadUserId: z.string().optional(),
  rows: z.enum(CUSTOM_ROWS).default("topic"),
  measure: z.enum(CUSTOM_MEASURES).default("meetings"),
});
export type ReportQueryInput = z.infer<typeof ReportQuery>;

export function parseReportQuery(params: URLSearchParams) {
  return ReportQuery.safeParse(collectParams(params, MEETING_LIST_MULTI_KEYS));
}

export const EXPORT_FILE_TYPES = ["xlsx", "csv"] as const;
export type ExportFileType = (typeof EXPORT_FILE_TYPES)[number];

/**
 * The export route's query: a report query plus `as`, the file to write. `history` is not a
 * report tab but a dossier's every-year tracker, so it needs a country or an organization.
 */
export const ExportQuery = ReportQuery.extend({
  report: z.enum([...REPORTS, "history"] as const).default("summary"),
  as: z.enum(EXPORT_FILE_TYPES).default("xlsx"),
  orgId: z.string().optional(),
});
export type ExportQueryInput = z.infer<typeof ExportQuery>;

export function parseExportQuery(params: URLSearchParams) {
  return ExportQuery.safeParse(collectParams(params, MEETING_LIST_MULTI_KEYS));
}

/** One row of `/api/documents` — the repository's library item after a JSON round trip. */
export const DocumentLibraryItemSchema = z.object({
  id: z.string(),
  meetingId: z.string(),
  meetingCode: z.string(),
  meetingTitle: z.string(),
  meetingStatus: z.enum(MEETING_STATUSES),
  scheduledStart: z.coerce.date().nullable(),
  countryCode: z.string(),
  countryName: z.string(),
  regionId: z.string(),
  regionName: z.string(),
  orgId: z.string().nullable(),
  orgName: z.string(),
  orgShortName: z.string().nullable(),
  fiscalYear: z.number().int(),
  kind: z.enum(DOCUMENT_KINDS),
  kindLabel: z.string(),
  title: z.string(),
  filename: z.string().nullable(),
  mime: z.string().nullable(),
  size: z.number().int().nullable(),
  version: z.number().int(),
  isCurrent: z.boolean(),
  reusable: z.boolean(),
  sourceDocumentId: z.string().nullable(),
  sourceMeetingCode: z.string().nullable(),
  sourceMeetingId: z.string().nullable(),
  topics: z.array(z.object({ id: z.string(), name: z.string() })),
  addedAt: z.coerce.date(),
  addedByName: z.string().nullable(),
  preview: z.enum(PREVIEW_KINDS).nullable(),
  storageScheme: z.enum(STORAGE_SCHEMES),
  link: z.string().nullable(),
});
export type DocumentLibraryItemDto = z.infer<typeof DocumentLibraryItemSchema>;

export const DocumentLibraryResponse = z.object({
  items: z.array(DocumentLibraryItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type DocumentLibraryResponse = z.infer<typeof DocumentLibraryResponse>;

/** `/api/documents/:id` — what the drawer shows: the document, every version of its slot, its source. */
export const DocumentDetailResponse = z.object({
  item: DocumentLibraryItemSchema,
  versions: z.array(DocumentLibraryItemSchema),
  source: DocumentLibraryItemSchema.nullable(),
});
export type DocumentDetailResponse = z.infer<typeof DocumentDetailResponse>;

/** The fields beside the file in an upload form; the file itself is checked by the service. */
export const UploadFields = z.object({
  meetingId: z.string().min(1),
  kind: z.enum(DOCUMENT_KINDS),
  title: z.string().trim().max(200).optional(),
  reusable: boolParam.default(false),
});
export type UploadFields = z.infer<typeof UploadFields>;

/** "Reuse in a meeting": the file travels into another meeting's slot, keeping its kind unless told otherwise. */
export const ReuseInput = z.object({
  sourceId: z.string().min(1),
  meetingId: z.string().min(1),
  kind: z.enum(DOCUMENT_KINDS).optional(),
});
export type ReuseInput = z.infer<typeof ReuseInput>;
