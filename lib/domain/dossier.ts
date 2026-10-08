import type { PreviewKind, StorageScheme } from "./documents";
import { fiscalYearOf } from "./fiscal-year";
import { COUNTED_STATUSES, countBy } from "./tallies";
import type { DocumentKind, ExpertStatus, MeetingStatus } from "./types";

/**
 * A dossier — a country's or an organization's page — derived from the meetings they took
 * part in and the documents those meetings keep. Pure: the service loads, this file counts,
 * ranks and caps. Inputs are the structural slice of the repo rows the rules need.
 */

export type DossierMeeting = {
  id: string;
  code: string;
  title: string;
  status: MeetingStatus;
  scheduledStart: Date | null;
  nextCandidate: Date | null;
  fiscalYear: number;
  participantTotal: number;
  topics: { id: string; name: string }[];
  experts: { staffId: string; name: string; bureauCode: string | null; status: ExpertStatus }[];
};

export type DossierDocument = {
  id: string;
  title: string;
  kind: DocumentKind;
  kindLabel: string;
  meetingId: string;
  meetingCode: string;
  reusable: boolean;
  addedAt: Date;
  preview: PreviewKind | null;
  storageScheme: StorageScheme;
  mime: string | null;
  isCurrent: boolean;
};

export type StaffInfo = { name: string; bureauCode: string | null; bureauName: string | null };

export type DossierFigures = {
  /** Confirmed, completed or closed meetings, all time. */
  engagements: number;
  /** The same, in the current fiscal year. */
  engagementsFy: number;
  fy: number;
  /** Participants recorded across the counted meetings. */
  participants: number;
  firstAt: Date | null;
  /** The latest counted meeting already held. */
  lastAt: Date | null;
  /** The earliest dated meeting still ahead and still in play; a candidate date counts. */
  next: { id: string; code: string; start: Date; status: MeetingStatus } | null;
};

export type TimelineLane = { id: string; name: string };
export type TimelineMeeting = { id: string; code: string; title: string; status: MeetingStatus; date: Date | null; participants: number; laneId: string; fiscalYear: number };
export type Timeline = { lanes: TimelineLane[]; meetings: TimelineMeeting[]; firstFy: number; lastFy: number };

export type Briefer = { staffId: string; name: string; bureauCode: string | null; bureauName: string | null; count: number };

export type Material = { id: string; title: string; kind: DocumentKind; kindLabel: string; meetingId: string; meetingCode: string; reusable: boolean; addedAt: Date; preview: PreviewKind | null; scheme: StorageScheme; mime: string | null };

export type Dossier = {
  figures: DossierFigures;
  timeline: Timeline;
  briefers: Briefer[];
  materials: Material[];
  /** Every current document on these meetings, not just the shelf's few. */
  materialsTotal: number;
  /** The library, filtered to this subject. */
  materialsHref: string;
};

export const TIMELINE_LANE_LIMIT = 5;
export const BRIEFER_LIMIT = 8;
export const MATERIAL_LIMIT = 6;
export const OTHER_LANE = "other";

/** Statuses with a date still ahead of them. */
export const IN_PLAY: readonly MeetingStatus[] = ["requested", "developing", "clearance", "confirmed"];

const isCounted = (m: DossierMeeting) => COUNTED_STATUSES.includes(m.status);
const dateOf = (m: DossierMeeting) => m.scheduledStart ?? m.nextCandidate;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en");

function figuresOf(meetings: DossierMeeting[], now: Date): DossierFigures {
  const fy = fiscalYearOf(now);
  const counted = meetings.filter(isCounted);
  const held = counted.map((m) => m.scheduledStart).filter((d): d is Date => d !== null);
  const past = held.filter((d) => d.getTime() <= now.getTime());
  const ahead = meetings
    .filter((m) => IN_PLAY.includes(m.status))
    .map((m) => ({ m, start: dateOf(m) }))
    .filter((x): x is { m: DossierMeeting; start: Date } => x.start !== null && x.start.getTime() >= now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const next = ahead[0];
  return {
    engagements: counted.length,
    engagementsFy: counted.filter((m) => m.fiscalYear === fy).length,
    fy,
    participants: counted.reduce((sum, m) => sum + m.participantTotal, 0),
    firstAt: held.length ? new Date(Math.min(...held.map((d) => d.getTime()))) : null,
    lastAt: past.length ? new Date(Math.max(...past.map((d) => d.getTime()))) : null,
    next: next ? { id: next.m.id, code: next.m.code, start: next.start, status: next.m.status } : null,
  };
}

function timelineOf(meetings: DossierMeeting[], now: Date): Timeline {
  const fy = fiscalYearOf(now);
  if (meetings.length === 0) return { lanes: [], meetings: [], firstFy: fy, lastFy: fy };

  const names = new Map<string, string>();
  for (const m of meetings) for (const t of m.topics) names.set(t.id, t.name);
  const top = countBy(meetings.filter(isCounted), (m) => m.topics.map((t) => t.id), (id) => names.get(id) ?? id).slice(0, TIMELINE_LANE_LIMIT);
  const laneIds = new Set(top.map((t) => t.key));
  const laneFor = (m: DossierMeeting) => m.topics.find((t) => laneIds.has(t.id))?.id ?? OTHER_LANE;

  const rows = meetings.map((m): TimelineMeeting => ({ id: m.id, code: m.code, title: m.title, status: m.status, date: dateOf(m), participants: m.participantTotal, laneId: laneFor(m), fiscalYear: m.fiscalYear }));
  // A meeting sits in the first of its topics that made a lane, so a lane can end up with nothing
  // in it when every meeting on that topic also has a higher-ranked one; an empty row is dropped.
  const used = new Set(rows.map((r) => r.laneId));
  const lanes: TimelineLane[] = top.filter((t) => used.has(t.key)).map((t) => ({ id: t.key, name: t.label }));
  if (used.has(OTHER_LANE)) lanes.push({ id: OTHER_LANE, name: "Other" });

  const years = meetings.map((m) => m.fiscalYear);
  const ahead = rows.some((r) => r.date === null || r.date.getTime() >= now.getTime());
  // The axis runs on to next year whenever something is still ahead or not yet scheduled.
  return { lanes, meetings: rows, firstFy: Math.min(...years), lastFy: Math.max(...years, ...(ahead ? [fy + 1] : [])) };
}

function briefersOf(meetings: DossierMeeting[], staff: Map<string, StaffInfo>): Briefer[] {
  const tally = new Map<string, Briefer>();
  for (const m of meetings) {
    for (const e of m.experts) {
      if (e.status !== "confirmed") continue;
      const known = staff.get(e.staffId);
      const row = tally.get(e.staffId) ?? { staffId: e.staffId, name: known?.name ?? e.name, bureauCode: known?.bureauCode ?? e.bureauCode, bureauName: known?.bureauName ?? null, count: 0 };
      row.count += 1;
      tally.set(e.staffId, row);
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || byName(a, b)).slice(0, BRIEFER_LIMIT);
}

function materialsOf(documents: DossierDocument[]): { materials: Material[]; materialsTotal: number } {
  const current = documents.filter((d) => d.isCurrent).sort((a, b) => Number(b.reusable) - Number(a.reusable) || b.addedAt.getTime() - a.addedAt.getTime());
  return {
    materialsTotal: current.length,
    materials: current.slice(0, MATERIAL_LIMIT).map((d) => ({ id: d.id, title: d.title, kind: d.kind, kindLabel: d.kindLabel, meetingId: d.meetingId, meetingCode: d.meetingCode, reusable: d.reusable, addedAt: d.addedAt, preview: d.preview, scheme: d.storageScheme, mime: d.mime })),
  };
}

export function buildDossier(meetings: DossierMeeting[], documents: DossierDocument[], staff: Map<string, StaffInfo>, now: Date, materialsHref: string): Dossier {
  return { figures: figuresOf(meetings, now), timeline: timelineOf(meetings, now), briefers: briefersOf(meetings, staff), ...materialsOf(documents), materialsHref };
}
