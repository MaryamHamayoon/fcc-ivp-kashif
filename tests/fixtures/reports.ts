import type { ExpertRow, ParticipantRow, ReportDataset, ReportMeeting } from "@/lib/domain/reports";
import { makeListItem } from "@/tests/fixtures/meetings";

/**
 * Six FY26 meetings across four regions, three topics and three formats — one of them only
 * requested, so it never counts — plus two FY25 meetings, one of which counts. Every number
 * asserted below was worked out by hand from this table before the code existed.
 */
const NOW = new Date("2026-08-29T14:00:00Z");
const FY = 2026;

const expert = (staffId: string, name: string, bureauCode: string, status: ExpertRow["status"]) => ({ id: `mex_${staffId}_${status}`, staffId, name, bureauCode, status, role: "briefer" as const });

const m1 = makeListItem({ id: "m1", code: "IVP-2026-041", status: "confirmed", format: "in_person", scheduledStart: new Date("2026-09-15T14:00:00Z"), participantTotal: 12, experts: [expert("stf_dana", "Dana Whitfield", "OEA", "confirmed")] });
const m2 = makeListItem({
  id: "m2",
  code: "IVP-2026-018",
  title: "Broadband mapping exchange",
  status: "completed",
  format: "virtual",
  countryCode: "KE",
  countryName: "Kenya",
  countryCodes: ["KE", "UG"],
  orgId: "ca-kenya",
  orgName: "Communications Authority of Kenya",
  orgShortName: "CA",
  scheduledStart: new Date("2026-03-10T14:00:00Z"),
  participantTotal: 8,
  topics: [{ id: "broadband-mapping", name: "Broadband Mapping" }],
  experts: [expert("stf_dana", "Dana Whitfield", "OEA", "confirmed"), expert("stf_tomas", "Tomas Lindqvist", "WTB", "declined")],
});
const m3 = makeListItem({
  id: "m3",
  code: "IVP-2026-004",
  title: "Ofcom spectrum sharing roundtable",
  status: "closed",
  format: "hybrid",
  regionId: "eur",
  regionName: "Europe",
  countryCode: "GB",
  countryName: "United Kingdom",
  countryCodes: ["GB"],
  orgId: "ofcom",
  orgName: "Ofcom",
  orgShortName: "Ofcom",
  leadUserId: "usr_marcus",
  leadName: "Marcus Bell",
  scheduledStart: new Date("2025-11-20T15:00:00Z"),
  participantTotal: 20,
  topics: [{ id: "spectrum-sharing", name: "Spectrum Sharing" }],
  experts: [expert("stf_tomas", "Tomas Lindqvist", "WTB", "confirmed")],
});
const m4 = makeListItem({
  id: "m4",
  code: "IVP-2026-052",
  title: "ACMA auctions briefing",
  status: "requested",
  format: "in_person",
  regionId: "eap",
  regionName: "East Asia & Pacific",
  countryCode: "AU",
  countryName: "Australia",
  countryCodes: ["AU"],
  orgId: "acma",
  orgName: "ACMA",
  orgShortName: "ACMA",
  scheduledStart: new Date("2026-06-01T14:00:00Z"),
  participantTotal: 5,
  topics: [{ id: "spectrum-auctions", name: "Spectrum Auctions" }],
  experts: [expert("stf_lee", "Lee Park", "WTB", "confirmed")],
});
const m5 = makeListItem({
  id: "m5",
  code: "IVP-2026-057",
  title: "Anatel mapping exchange",
  status: "confirmed",
  format: "virtual",
  regionId: "wha",
  regionName: "Western Hemisphere",
  countryCode: "BR",
  countryName: "Brazil",
  countryCodes: ["BR"],
  orgId: "anatel",
  orgName: "Anatel",
  orgShortName: "Anatel",
  leadUserId: "usr_marcus",
  leadName: "Marcus Bell",
  scheduledStart: null,
  scheduledEnd: null,
  participantTotal: 6,
  topics: [{ id: "broadband-mapping", name: "Broadband Mapping" }],
  experts: [],
});
const m6 = makeListItem({
  id: "m6",
  code: "IVP-2026-023",
  title: "BTRC spectrum sharing visit",
  status: "completed",
  format: "in_person",
  regionId: "sca",
  regionName: "South & Central Asia",
  countryCode: "BD",
  countryName: "Bangladesh",
  countryCodes: ["BD"],
  orgId: "btrc",
  orgName: "BTRC",
  orgShortName: "BTRC",
  leadUserId: null,
  leadName: null,
  scheduledStart: new Date("2026-03-25T14:00:00Z"),
  participantTotal: 9,
  topics: [{ id: "spectrum-sharing", name: "Spectrum Sharing" }],
  experts: [expert("stf_dana", "Dana Whitfield", "OEA", "requested")],
});
const p1 = makeListItem({ id: "p1", code: "IVP-2025-030", status: "confirmed", fiscalYear: 2025, scheduledStart: new Date("2025-03-05T14:00:00Z"), participantTotal: 10, topics: [{ id: "spectrum-sharing", name: "Spectrum Sharing" }], experts: [] });
const p2 = makeListItem({ id: "p2", code: "IVP-2025-044", status: "requested", fiscalYear: 2025, countryCode: "NG", countryName: "Nigeria", countryCodes: ["NG"], scheduledStart: new Date("2025-05-01T14:00:00Z"), participantTotal: 4, experts: [] });

const meetings: ReportMeeting[] = [m1, m2, m3, m4, m5, m6];
const priorMeetings: ReportMeeting[] = [p1, p2];

const participants: ParticipantRow[] = [
  { meetingId: "m1", category: "foreign_gov", planned: 10, actual: null },
  { meetingId: "m1", category: "fcc", planned: 2, actual: null },
  { meetingId: "m2", category: "foreign_gov", planned: 6, actual: 7 },
  { meetingId: "m2", category: "fcc", planned: 2, actual: 2 },
  { meetingId: "m4", category: "foreign_gov", planned: 5, actual: null },
  { meetingId: "m5", category: "foreign_gov", planned: 6, actual: null },
  { meetingId: "m6", category: "foreign_gov", planned: 8, actual: 6 },
  { meetingId: "m6", category: "industry", planned: 1, actual: null },
];
const priorParticipants: ParticipantRow[] = [{ meetingId: "p1", category: "foreign_gov", planned: 10, actual: 11 }];

const row = (meetingId: string, staffId: string, name: string, bureauCode: string, bureauName: string, status: ExpertRow["status"], requestedAt: string | null, respondedAt: string | null): ExpertRow => ({
  meetingId,
  staffId,
  name,
  bureauCode,
  bureauName,
  status,
  requestedAt: requestedAt ? new Date(requestedAt) : null,
  respondedAt: respondedAt ? new Date(respondedAt) : null,
});
const experts: ExpertRow[] = [
  row("m1", "stf_dana", "Dana Whitfield", "OEA", "Office of Economics and Analytics", "confirmed", "2026-08-03T14:00:00Z", "2026-08-05T14:00:00Z"), // 2 business days
  row("m2", "stf_dana", "Dana Whitfield", "OEA", "Office of Economics and Analytics", "confirmed", "2026-02-02T14:00:00Z", "2026-02-09T14:00:00Z"), // 5
  row("m2", "stf_tomas", "Tomas Lindqvist", "WTB", "Wireless Telecommunications Bureau", "declined", "2026-02-02T14:00:00Z", "2026-02-03T14:00:00Z"), // 1
  row("m3", "stf_tomas", "Tomas Lindqvist", "WTB", "Wireless Telecommunications Bureau", "confirmed", "2025-10-06T14:00:00Z", "2025-10-10T14:00:00Z"), // 4
  row("m4", "stf_lee", "Lee Park", "WTB", "Wireless Telecommunications Bureau", "confirmed", "2026-05-04T14:00:00Z", "2026-05-05T14:00:00Z"), // m4 never counts
  row("m6", "stf_dana", "Dana Whitfield", "OEA", "Office of Economics and Analytics", "requested", "2026-03-02T14:00:00Z", null),
];

const dataset = (over: Partial<ReportDataset> = {}): ReportDataset => ({ fy: FY, now: NOW, filters: {}, meetings, priorMeetings, participants, priorParticipants, experts, ...over });

export { NOW as REPORT_NOW, FY as REPORT_FY, meetings as reportMeetings, priorMeetings as priorReportMeetings, participants as participantRows, priorParticipants as priorParticipantRows, experts as expertRows, row as makeExpertRow, dataset as makeReportDataset };
