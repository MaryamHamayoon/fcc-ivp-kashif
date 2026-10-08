import type { Db } from "@/lib/db/factory";
import { makeMeetingsRepo, type MeetingListItem } from "@/lib/db/repos/meetings";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { type PolicyUser, readableScope } from "@/lib/domain/policy";
import { byStart, type ReachData, type ReachMeeting } from "@/lib/domain/reach";

/**
 * Everything the Global reach full screen needs, in one payload: every meeting the reader may
 * see, in the map's own shape, and the countries and bureaus those meetings name. An expert sees
 * only their own briefings. The derivations live in `lib/domain/reach`; the dashboard card runs
 * them here on the server, the full screen runs them in the browser.
 */

/** The host country. Every visit ends in Washington, so the map never marks it. */
const HOST = "US";

const isString = (v: string | null | undefined): v is string => typeof v === "string" && v.length > 0;

/** One list row in the map's shape; `known` is every country code the reference data can place. */
export function toReachMeeting(m: MeetingListItem, known: ReadonlySet<string>): ReachMeeting {
  const experts = m.experts.filter((e) => e.status !== "declined" && e.status !== "withdrawn");
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    status: m.status,
    format: m.format,
    start: m.scheduledStart ?? m.nextCandidate,
    proposed: m.scheduledStart === null && m.nextCandidate !== null,
    countries: m.countryCodes.filter((code) => code !== HOST && known.has(code)),
    orgName: m.orgName,
    region: m.regionName,
    participants: m.participantTotal,
    topics: m.topics.map((t) => t.name),
    bureaus: [...new Set(experts.map((e) => e.bureauCode).filter(isString))],
    och: m.ochAttending,
    highPriority: m.priority === "high",
    readiness: m.readiness.percent,
    missing: m.readiness.missing.map((item) => ({ label: item.label, detail: item.detail })),
    waiting: m.waiting && { who: m.waiting.who, label: m.waiting.label, businessDays: m.waiting.businessDays, band: m.waiting.band },
    lead: m.leadName,
    delegationSize: m.delegationSize,
    experts: experts.map((e) => ({ name: e.name, bureau: e.bureauCode, lead: e.role === "lead", confirmed: e.status === "confirmed" })),
  };
}

export async function getReachData(db: Db, opts: { user: PolicyUser; now?: Date }): Promise<ReachData> {
  const now = opts.now ?? new Date();
  const ref = makeReferenceRepo(db);
  const [items, countries, bureaus] = await Promise.all([makeMeetingsRepo(db).forReach(readableScope(opts.user), now), ref.countries(), ref.bureaus()]);
  const known = new Set(countries.map((c) => c.cca2));
  const meetings = items.map((m) => toReachMeeting(m, known)).sort(byStart);
  const named = new Set(meetings.flatMap((m) => m.countries));
  return {
    asOf: now,
    meetings,
    countries: countries.filter((c) => named.has(c.cca2)).map((c) => ({ cca2: c.cca2, ccn3: c.ccn3, name: c.name, region: c.region.name, lat: c.lat, lng: c.lng })),
    bureaus: bureaus.map((b) => ({ code: b.code, name: b.name })),
  };
}
