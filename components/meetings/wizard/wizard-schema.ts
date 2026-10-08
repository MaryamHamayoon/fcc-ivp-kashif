import { z } from "zod";
import type { CreateMeetingInputRaw } from "@/lib/api/schemas";
import { NY_TZ, nyDate } from "@/lib/domain/fiscal-year";
import { MEETING_FORMATS, ORG_KINDS, type InterpreterMode, type MeetingFormat, type OrgKind, type ParticipantCategory } from "@/lib/domain/types";

/** Interpretation modes read as plain words on the form and in the review. */
export const INTERPRETER_LABELS: Record<InterpreterMode, string> = {
  none: "None",
  consecutive: "Consecutive",
  simultaneous: "Simultaneous",
};

/** DOM id for a draft path — one convention, so a validation message can move focus to its control. */
export const fieldId = (path: string): string => `f-${path.replace(/\./g, "-")}`;

/**
 * The intake wizard's draft: every value is held exactly as the form holds it
 * (strings, including the `datetime-local` wall-clock ones) so a half-finished
 * request can be written to localStorage and read back without losing anything.
 * `toCreateInput` is the single place that turns a draft into API input.
 */

export type MemberDraft = { key: string; name: string; title: string; category: ParticipantCategory; isInterpreter: boolean };
export type TopicDraft = { topicId: string; detail: string };

export type RequestorDraft = {
  name: string;
  title: string;
  organizationName: string;
  /** "" until chosen, so the select can start empty. */
  organizationKind: OrgKind | "";
  email: string;
  phone: string;
  viaIntermediary: string;
};

export type DelegationDraft = { headline: string; purpose: string; size: string; members: MemberDraft[] };
export type DatesDraft = { preferredStart: string; preferredEnd: string; alternateStart: string; format: MeetingFormat | ""; timezone: string };
export type LogisticsDraft = { needsAv: boolean; interpreter: InterpreterMode; accommodations: string; localContact: string; backgroundUrl: string };

export type WizardDraft = {
  requestor: RequestorDraft;
  countryCodes: string[];
  regionId: string;
  leadUserId: string;
  delegation: DelegationDraft;
  topics: TopicDraft[];
  dates: DatesDraft;
  logistics: LogisticsDraft;
  ochRequested: boolean;
};

export const EMPTY_DRAFT: WizardDraft = {
  requestor: { name: "", title: "", organizationName: "", organizationKind: "", email: "", phone: "", viaIntermediary: "" },
  countryCodes: [],
  regionId: "",
  leadUserId: "",
  delegation: { headline: "", purpose: "", size: "", members: [] },
  topics: [],
  dates: { preferredStart: "", preferredEnd: "", alternateStart: "", format: "", timezone: NY_TZ },
  logistics: { needsAv: false, interpreter: "none", accommodations: "", localContact: "", backgroundUrl: "" },
  ochRequested: false,
};

/* ------------------------------- option lists ------------------------------ */

export type CountryOption = { code: string; name: string; regionId: string };
export type RegionOption = { id: string; name: string };
export type TopicOption = { id: string; name: string; group: string };
export type LeadOption = { id: string; name: string; title?: string | null };
export type WizardOptions = { countries: CountryOption[]; regions: RegionOption[]; topics: TopicOption[]; leads: LeadOption[] };

/* --------------------------------- the action ------------------------------ */

export type CreateMeetingResult = { ok: true; id: string; code: string } | { ok: false; error: string };
export type CreateMeetingAction = (input: unknown) => Promise<CreateMeetingResult>;

/* ---------------------------------- steps ---------------------------------- */

export const WIZARD_STEPS = [
  { id: "requestor", title: "Requestor", blurb: "Who asked, and on whose behalf" },
  { id: "country", title: "Country & lead", blurb: "Where the delegation comes from, and who owns it here" },
  { id: "delegation", title: "Delegation & topics", blurb: "Who is travelling and what they want to discuss" },
  { id: "dates", title: "Dates & format", blurb: "When they can come, and how you will meet" },
  { id: "logistics", title: "Logistics", blurb: "Room, interpretation and anything else to arrange" },
  { id: "review", title: "Review", blurb: "Read it once, then create the record" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];
export type StepId = WizardStep["id"];
export const STEP_COUNT = WIZARD_STEPS.length;
export const REVIEW_STEP = STEP_COUNT - 1;

export function stepIndex(id: StepId): number {
  return WIZARD_STEPS.findIndex((s) => s.id === id);
}

/* ------------------------------- wall clocks ------------------------------- */

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * A `datetime-local` value is a wall clock with no zone. Every IVP meeting runs on
 * the Commission's clock, so the entered time is read as Washington time — the same
 * instant is produced whatever zone the reader's browser sits in.
 */
export function parseWallClock(value: string): Date | null {
  const m = WALL_CLOCK.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const date = nyDate(year, month, day, hour, minute);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/* ------------------------------ step validation ----------------------------- */

export type FieldErrors = Record<string, string>;

const oneOf = <T extends string>(values: readonly T[], message: string) => z.string().refine((v) => (values as readonly string[]).includes(v), message);

const requestorStep = z.object({
  requestor: z.object({
    name: z.string().trim().min(2, "Enter the requestor's full name."),
    title: z.string().trim().max(120, "Keep the title under 120 characters."),
    organizationName: z.string().trim().min(2, "Enter the organization the request came from."),
    organizationKind: oneOf(ORG_KINDS, "Choose the kind of organization."),
    email: z.string().trim().min(1, "Enter an email address for the requestor.").email("Enter a valid email address."),
    phone: z.string().trim().max(40, "Keep the phone number under 40 characters."),
    viaIntermediary: z.string().trim().max(200, "Keep this under 200 characters."),
  }),
});

const countryStep = z.object({
  countryCodes: z.array(z.string()).min(1, "Choose at least one country."),
  regionId: z.string().min(1, "Choose the OIA region that owns this visit."),
});

const delegationStep = z.object({
  delegation: z.object({
    headline: z.string().trim().min(3, "Give the meeting a title — what the visit is about."),
    purpose: z.string().trim().max(4000, "Keep the purpose under 4,000 characters."),
    size: z
      .string()
      .trim()
      .min(1, "How many people are expected?")
      .refine((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 60, "Enter a delegation size between 1 and 60."),
    members: z.array(
      z.object({
        name: z.string().trim().min(1, "Name this delegate, or remove the row."),
        title: z.string().trim().max(120, "Keep the title under 120 characters."),
      }),
    ),
  }),
  topics: z
    .array(z.object({ detail: z.string().trim().max(500, "Keep the question under 500 characters.") }))
    .min(1, "Choose at least one topic — it drives who briefs them."),
});

const datesStep = z.object({
  dates: z
    .object({
      preferredStart: z.string().trim().min(1, "Pick the date the delegation prefers."),
      preferredEnd: z.string(),
      alternateStart: z.string(),
      format: oneOf(MEETING_FORMATS, "Choose how the meeting will be held."),
    })
    .superRefine((d, ctx) => {
      const start = parseWallClock(d.preferredStart);
      if (d.preferredStart.trim() !== "" && !start) {
        ctx.addIssue({ code: "custom", path: ["preferredStart"], message: "That date could not be read." });
        return;
      }
      const end = d.preferredEnd.trim() === "" ? null : parseWallClock(d.preferredEnd);
      if (d.preferredEnd.trim() !== "" && !end) ctx.addIssue({ code: "custom", path: ["preferredEnd"], message: "That date could not be read." });
      if (start && end && end.getTime() <= start.getTime()) ctx.addIssue({ code: "custom", path: ["preferredEnd"], message: "The end must come after the start." });
      const alternate = d.alternateStart.trim() === "" ? null : parseWallClock(d.alternateStart);
      if (d.alternateStart.trim() !== "" && !alternate) ctx.addIssue({ code: "custom", path: ["alternateStart"], message: "That date could not be read." });
      if (start && alternate && alternate.getTime() <= start.getTime()) {
        ctx.addIssue({ code: "custom", path: ["alternateStart"], message: "The alternate date must come after the preferred date." });
      }
    }),
});

const logisticsStep = z.object({
  logistics: z.object({
    accommodations: z.string().trim().max(1000, "Keep this under 1,000 characters."),
    localContact: z.string().trim().max(300, "Keep this under 300 characters."),
    backgroundUrl: z.string().trim().refine((v) => v === "" || isHttpUrl(v), "Enter a full link, starting with https://"),
  }),
});

const STEP_SCHEMAS: readonly (z.ZodType | null)[] = [requestorStep, countryStep, delegationStep, datesStep, logisticsStep, null];

function toFieldErrors(issues: readonly z.core.$ZodIssue[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!(path in errors)) errors[path] = issue.message;
  }
  return errors;
}

/** Messages for one step, keyed by dotted draft path ("requestor.email", "delegation.members.0.name"). */
export function validateStep(step: number, draft: WizardDraft): FieldErrors {
  const schema = STEP_SCHEMAS[step];
  if (!schema) return {};
  const result = schema.safeParse(draft);
  return result.success ? {} : toFieldErrors(result.error.issues);
}

/** Every message across the entry steps — what the review step checks before submitting. */
export function validateAll(draft: WizardDraft): FieldErrors {
  const errors: FieldErrors = {};
  for (let step = 0; step < REVIEW_STEP; step += 1) Object.assign(errors, validateStep(step, draft));
  return errors;
}

/** The first step that still has a problem, or -1 when the draft is ready to submit. */
export function firstInvalidStep(draft: WizardDraft): number {
  for (let step = 0; step < REVIEW_STEP; step += 1) {
    if (Object.keys(validateStep(step, draft)).length > 0) return step;
  }
  return -1;
}

/* -------------------------------- conversion ------------------------------- */

const optional = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const instant = (value: string): string | undefined => parseWallClock(value)?.toISOString();

/** Draft → `CreateMeetingInput` payload. Blank optional fields are dropped, not sent as "". */
export function toCreateInput(draft: WizardDraft): CreateMeetingInputRaw {
  return {
    requestor: {
      name: draft.requestor.name.trim(),
      title: optional(draft.requestor.title),
      organizationName: draft.requestor.organizationName.trim(),
      organizationKind: draft.requestor.organizationKind as OrgKind,
      email: draft.requestor.email.trim(),
      phone: optional(draft.requestor.phone),
      viaIntermediary: optional(draft.requestor.viaIntermediary),
    },
    countryCodes: [...draft.countryCodes],
    regionId: draft.regionId,
    leadUserId: optional(draft.leadUserId),
    delegation: {
      headline: draft.delegation.headline.trim(),
      purpose: optional(draft.delegation.purpose),
      size: Number(draft.delegation.size),
      members: draft.delegation.members
        .filter((m) => m.name.trim() !== "")
        .map((m) => ({ name: m.name.trim(), title: optional(m.title), category: m.category, isInterpreter: m.isInterpreter })),
    },
    topics: draft.topics.map((t) => ({ topicId: t.topicId, detail: optional(t.detail) })),
    dates: {
      preferredStart: instant(draft.dates.preferredStart),
      preferredEnd: instant(draft.dates.preferredEnd),
      alternateStart: instant(draft.dates.alternateStart),
      format: draft.dates.format as MeetingFormat,
      timezone: draft.dates.timezone || NY_TZ,
    },
    logistics: {
      needsAv: draft.logistics.needsAv,
      interpreter: draft.logistics.interpreter,
      accommodations: optional(draft.logistics.accommodations),
      localContact: optional(draft.logistics.localContact),
      backgroundUrl: optional(draft.logistics.backgroundUrl),
    },
    ochRequested: draft.ochRequested,
  };
}

/* ---------------------------------- helpers -------------------------------- */

/** The region of the first chosen country — the coordinator can still override it. */
export function deriveRegionId(countryCodes: readonly string[], countries: readonly CountryOption[]): string {
  const first = countryCodes[0];
  if (!first) return "";
  return countries.find((c) => c.code === first)?.regionId ?? "";
}

export function newMemberKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `m${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyMember(): MemberDraft {
  return { key: newMemberKey(), name: "", title: "", category: "foreign_gov", isInterpreter: false };
}
