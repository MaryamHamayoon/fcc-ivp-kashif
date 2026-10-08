import type { Db } from "@/lib/db/factory";
import { makeMeetingsRepo, type MeetingListItem } from "@/lib/db/repos/meetings";
import { makeReferenceRepo } from "@/lib/db/repos/reference";
import { fiscalMonthIndex, fiscalYearProgress } from "@/lib/domain/fiscal-year";
import { type FormatShare, formatShares, type TopicFlows, topicFlows } from "@/lib/domain/insights";
import { type PolicyUser, readableScope } from "@/lib/domain/policy";
import { OIA_REGIONS } from "@/lib/domain/regions";
import { ACTIVE_STATUSES, VIEW_STATUSES } from "@/lib/domain/status-machine";
import { type CardRange, cardRange } from "@/lib/domain/reach";
import { COUNTED_STATUSES, countBy, monthlyCadence, type NamedCount, type TallyMeeting } from "@/lib/domain/tallies";
import type { MeetingStatus } from "@/lib/domain/types";
import { type Bounds, boundsOf, REGION_PAD } from "@/lib/geo/camera";
import { getReachData } from "./reach";

/**
 * Everything the executive dashboard shows, computed in one pass over a single
 * load of the meetings that matter: this fiscal year, the year before it (for
 * comparisons) and whatever is still in play. Experts see only their own
 * briefings; every figure respects that scope.
 */

const DAY = 86_400_000;
/** As many rows as the card holds beside the map without a scrollbar. */
const UPCOMING_LIST_LIMIT = 8;
const UPCOMING_WINDOW_DAYS = 30;
const TOP_N = 8;

/** Meetings that are real enough to call "upcoming" when they carry a date: the band's 30-day figure. */
const UPCOMING_STATUSES: readonly MeetingStatus[] = ["developing", "clearance", "confirmed"];

export type Kpi = {
  value: number;
  /** Same figure for the prior fiscal year; null when there is no meaningful comparison. */
  prior: number | null;
  /** 12 buckets for a sparkline: fiscal months to date (zero after the current month), or the next 12 weeks for `upcoming30`. */
  series: number[];
};

/** A region the card's Region menu offers, with a frame around all its countries for when none has meetings in the range. */
export type CardRegion = { name: string; bounds: Bounds };

/**
 * The Global reach card: its two ranges, counted on the server by the map's own functions, so
 * the card never downloads meeting-level data and always agrees with the full screen.
 */
export type ReachCard = { next30: CardRange; thisYear: CardRange; regions: CardRegion[] };

export type DashboardData = {
  asOf: Date;
  fiscalYear: number;
  /** True when the user only sees meetings they are assigned to. */
  scoped: boolean;
  kpis: { meetingsFy: Kpi; countriesFy: Kpi; participantsFy: Kpi; upcoming30: Kpi };
  /** The next meetings on the calendar, soonest first, as the Upcoming view lists them. */
  upcoming: MeetingListItem[];
  /** Every meeting the Upcoming view holds, so the card and the rail's Upcoming row agree. */
  upcomingTotal: number;
  reach: ReachCard;
  analytics: {
    /** The year's top topics and the regions that raised them. */
    topics: TopicFlows;
    /** How the year's meetings split across formats, against last year's split. */
    formats: FormatShare[];
    cadence: { month: string; current: number; prior: number }[];
    bureaus: NamedCount[];
  };
};

/* -------------------------------- helpers -------------------------------- */

const isString = (v: string | null | undefined): v is string => typeof v === "string" && v.length > 0;
const distinct = (values: string[]) => [...new Set(values)];
const sum = (items: MeetingListItem[], weigh: (m: MeetingListItem) => number) => items.reduce((acc, m) => acc + weigh(m), 0);
const isCounted = (m: MeetingListItem) => COUNTED_STATUSES.includes(m.status);
const within = (date: Date | null, now: Date, days: number) => date !== null && date.getTime() >= now.getTime() && date.getTime() <= now.getTime() + days * DAY;

/** Per fiscal month (Oct…Sep); months at or past `monthsToDate` stay zero so the sparkline reads "so far". */
function monthlySeries(meetings: MeetingListItem[], monthsToDate: number, weigh: (m: MeetingListItem) => number): number[] {
  const out = new Array<number>(12).fill(0);
  for (const m of meetings) {
    if (!m.scheduledStart) continue;
    const i = fiscalMonthIndex(m.scheduledStart);
    if (i < monthsToDate) out[i] = (out[i] ?? 0) + weigh(m);
  }
  return out;
}

function monthlyDistinct(meetings: MeetingListItem[], monthsToDate: number, keys: (m: MeetingListItem) => string[]): number[] {
  const sets = Array.from({ length: 12 }, () => new Set<string>());
  for (const m of meetings) {
    if (!m.scheduledStart) continue;
    const i = fiscalMonthIndex(m.scheduledStart);
    if (i < monthsToDate) for (const k of keys(m)) sets[i]?.add(k);
  }
  return sets.map((set) => set.size);
}

/** Dated meetings per week for the next `weeks` weeks. */
function weeklySeries(meetings: MeetingListItem[], now: Date, weeks = 12): number[] {
  const out = new Array<number>(weeks).fill(0);
  for (const m of meetings) {
    if (!m.scheduledStart) continue;
    const w = Math.floor((m.scheduledStart.getTime() - now.getTime()) / (7 * DAY));
    if (w >= 0 && w < weeks) out[w] = (out[w] ?? 0) + 1;
  }
  return out;
}

const engagedBureaus = (m: MeetingListItem) => distinct(m.experts.filter((e) => e.status !== "declined" && e.status !== "withdrawn").map((e) => e.bureauCode).filter(isString));

const toTally = (m: MeetingListItem): TallyMeeting => ({
  id: m.id,
  fiscalYear: m.fiscalYear,
  status: m.status,
  format: m.format,
  regionName: m.regionName,
  countryName: m.countryName,
  countryCode: m.countryCode,
  topics: m.topics.map((t) => t.name),
  bureaus: engagedBureaus(m),
  participantTotal: m.participantTotal,
  scheduledStart: m.scheduledStart,
});

/* --------------------------------- service -------------------------------- */

export async function getDashboardData(db: Db, opts: { fy?: number; now?: Date; user: PolicyUser }): Promise<DashboardData> {
  const now = opts.now ?? new Date();
  const progress = fiscalYearProgress(now);
  const fy = opts.fy ?? progress.fy;
  const isCurrent = fy === progress.fy;
  const monthsToDate = isCurrent ? fiscalMonthIndex(now) + 1 : fy < progress.fy ? 12 : 0;

  const scope = readableScope(opts.user);
  const scoped = !("all" in scope);
  const visible = (m: MeetingListItem) => !scoped || m.experts.some((e) => "staffId" in scope && e.staffId === scope.staffId);

  const meetings = makeMeetingsRepo(db);
  const ref = makeReferenceRepo(db);
  const [loaded, countries, bureaus, reachData] = await Promise.all([meetings.forDashboard([fy, fy - 1], now), ref.countries(), ref.bureaus(), getReachData(db, { user: opts.user, now })]);

  const items = loaded.items.filter(visible);

  const thisFy = items.filter((m) => m.fiscalYear === fy);
  const lastFy = items.filter((m) => m.fiscalYear === fy - 1);
  const counted = thisFy.filter(isCounted);
  const countedPrior = lastFy.filter(isCounted);
  const inPlay = items.filter((m) => ACTIVE_STATUSES.includes(m.status));
  const upcomingPool = inPlay.filter((m) => UPCOMING_STATUSES.includes(m.status));
  // The Upcoming view's own rule: an open meeting whose accepted date is still ahead.
  const upcomingView = VIEW_STATUSES.upcoming ?? [];
  const ahead = items
    .filter((m) => upcomingView.includes(m.status) && m.scheduledStart !== null && m.scheduledStart.getTime() >= now.getTime())
    .sort((a, b) => (a.scheduledStart?.getTime() ?? 0) - (b.scheduledStart?.getTime() ?? 0) || a.code.localeCompare(b.code));

  /* KPIs */
  const kpis: DashboardData["kpis"] = {
    meetingsFy: { value: counted.length, prior: countedPrior.length, series: monthlySeries(counted, monthsToDate, () => 1) },
    countriesFy: {
      value: distinct(counted.flatMap((m) => m.countryCodes)).length,
      prior: distinct(countedPrior.flatMap((m) => m.countryCodes)).length,
      series: monthlyDistinct(counted, monthsToDate, (m) => m.countryCodes),
    },
    participantsFy: {
      value: sum(counted, (m) => m.participantTotal),
      prior: sum(countedPrior, (m) => m.participantTotal),
      series: monthlySeries(counted, monthsToDate, (m) => m.participantTotal),
    },
    upcoming30: { value: upcomingPool.filter((m) => within(m.scheduledStart, now, UPCOMING_WINDOW_DAYS)).length, prior: null, series: weeklySeries(upcomingPool, now) },
  };

  /* Global reach */
  const centers = new Map<string, { lng: number; lat: number }[]>();
  for (const c of countries) centers.set(c.region.name, [...(centers.get(c.region.name) ?? []), { lng: c.lng, lat: c.lat }]);
  const reach: ReachCard = {
    next30: cardRange(reachData, "next30", now),
    thisYear: cardRange(reachData, "this", now),
    regions: OIA_REGIONS.flatMap((r) => {
      const bounds = boundsOf(centers.get(r.name) ?? [], REGION_PAD);
      return bounds ? [{ name: r.name, bounds }] : [];
    }),
  };

  /* Analytics */
  const bureauName = new Map(bureaus.map((b) => [b.code, b.name]));
  const analytics: DashboardData["analytics"] = {
    topics: topicFlows(counted.map(toTally), TOP_N),
    formats: formatShares(counted.map(toTally), countedPrior.map(toTally)),
    cadence: monthlyCadence([...thisFy, ...lastFy].map(toTally), fy),
    bureaus: countBy(counted, engagedBureaus, (k) => bureauName.get(k) ?? k).slice(0, TOP_N),
  };

  return {
    asOf: now,
    fiscalYear: fy,
    scoped,
    kpis,
    upcoming: ahead.slice(0, UPCOMING_LIST_LIMIT),
    upcomingTotal: ahead.length,
    reach,
    analytics,
  };
}
