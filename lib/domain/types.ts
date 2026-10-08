/**
 * Domain vocabulary for IVP. Pure data — no framework imports.
 * String values are persisted in the database; never rename without a migration.
 */

export const MEETING_STATUSES = [
  "requested",
  "developing",
  "clearance",
  "confirmed",
  "completed",
  "closed",
  "on_hold",
  "cancelled",
] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_FORMATS = ["in_person", "virtual", "hybrid"] as const;
export type MeetingFormat = (typeof MEETING_FORMATS)[number];

export const EXPERT_STATUSES = ["tbd", "requested", "confirmed", "declined", "withdrawn"] as const;
export type ExpertStatus = (typeof EXPERT_STATUSES)[number];

export const EXPERT_ROLES = ["lead", "briefer", "attendee"] as const;
export type ExpertRole = (typeof EXPERT_ROLES)[number];

export const CANDIDATE_DATE_STATUSES = ["proposed", "accepted", "declined", "withdrawn"] as const;
export type CandidateDateStatus = (typeof CANDIDATE_DATE_STATUSES)[number];

export const PROPOSERS = ["fcc", "visitor"] as const;
export type Proposer = (typeof PROPOSERS)[number];

export const PARTICIPANT_CATEGORIES = ["fcc", "other_usg", "foreign_gov", "industry", "academia_ngo", "other"] as const;
export type ParticipantCategory = (typeof PARTICIPANT_CATEGORIES)[number];

export const DOCUMENT_KINDS = [
  "work_plan",
  "agenda_draft",
  "agenda_final",
  "briefing_deck",
  "participant_list",
  "bio_packet",
  "readout",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const ACTIVITY_KINDS = [
  "note",
  "email_out",
  "email_in",
  "call",
  "date_proposed",
  "date_confirmed",
  "expert_requested",
  "expert_confirmed",
  "expert_declined",
  "status_change",
  "document_added",
  "hold",
  "resume",
  "system",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const WAITING_ON = ["none", "visitor", "expert", "internal", "och"] as const;
export type WaitingOn = (typeof WAITING_ON)[number];

export const ROLES = ["admin", "coordinator", "regional_lead", "expert", "executive", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ORG_KINDS = ["regulator", "ministry", "embassy", "international_org", "industry", "academia", "other"] as const;
export type OrgKind = (typeof ORG_KINDS)[number];

export const INTERPRETER_MODES = ["none", "consecutive", "simultaneous"] as const;
export type InterpreterMode = (typeof INTERPRETER_MODES)[number];

/** Stored as free text (no DB enum) — this is the closed set the app ever writes or offers. */
export const PRIORITIES = ["normal", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  requested: "Requested",
  developing: "Developing",
  clearance: "Clearance",
  confirmed: "Confirmed",
  completed: "Completed",
  closed: "Closed",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

export const FORMAT_LABELS: Record<MeetingFormat, string> = {
  in_person: "In person",
  virtual: "Virtual",
  hybrid: "Hybrid",
};

export const EXPERT_STATUS_LABELS: Record<ExpertStatus, string> = {
  tbd: "To be determined",
  requested: "Requested",
  confirmed: "Confirmed",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

export const PARTICIPANT_CATEGORY_LABELS: Record<ParticipantCategory, string> = {
  fcc: "FCC",
  other_usg: "Other U.S. Government",
  foreign_gov: "Foreign Government",
  industry: "Industry",
  academia_ngo: "Academia / NGO",
  other: "Other",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  work_plan: "Work Plan",
  agenda_draft: "Draft Agenda",
  agenda_final: "Final Agenda",
  briefing_deck: "Briefing Deck",
  participant_list: "Participant List",
  bio_packet: "Delegation Bios",
  readout: "Readout",
  other: "Other",
};

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  note: "Note",
  email_out: "Email sent",
  email_in: "Email received",
  call: "Call",
  date_proposed: "Date proposed",
  date_confirmed: "Date confirmed",
  expert_requested: "Expert requested",
  expert_confirmed: "Expert confirmed",
  expert_declined: "Expert declined",
  status_change: "Status change",
  document_added: "Document added",
  hold: "Placed on hold",
  resume: "Resumed",
  system: "System",
};

export const WAITING_ON_LABELS: Record<WaitingOn, string> = {
  none: "Nobody",
  visitor: "the visiting delegation",
  expert: "FCC expert",
  internal: "OIA front office",
  och: "Office of the Chairman",
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  coordinator: "Coordinator",
  regional_lead: "Regional Lead",
  expert: "Expert / Briefer",
  executive: "Executive",
  viewer: "Viewer",
};

export const ORG_KIND_LABELS: Record<OrgKind, string> = {
  regulator: "Regulator",
  ministry: "Ministry",
  embassy: "Embassy",
  international_org: "International organization",
  industry: "Industry",
  academia: "Academia",
  other: "Other",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  normal: "Normal",
  high: "High priority",
};
