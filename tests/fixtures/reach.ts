import type { ReachBureau, ReachCountry, ReachData, ReachMeeting } from "@/lib/domain/reach";

/** Monday, September 28, 2026, noon in Washington. */
export const REACH_NOW = new Date("2026-09-28T16:00:00Z");

export const REACH_COUNTRIES: ReachCountry[] = [
  { cca2: "JP", ccn3: "392", name: "Japan", region: "Asia-Pacific", lat: 35.68, lng: 139.69 },
  { cca2: "KE", ccn3: "404", name: "Kenya", region: "Africa", lat: -1.29, lng: 36.82 },
  { cca2: "BR", ccn3: "076", name: "Brazil", region: "Americas", lat: -15.79, lng: -47.88 },
  { cca2: "DE", ccn3: "276", name: "Germany", region: "Europe", lat: 52.52, lng: 13.4 },
  { cca2: "GB", ccn3: "826", name: "United Kingdom", region: "Europe", lat: 51.51, lng: -0.13 },
  { cca2: "FJ", ccn3: "242", name: "Fiji", region: "Asia-Pacific", lat: -18.14, lng: 178.44 },
];

export const REACH_BUREAUS: ReachBureau[] = [
  { code: "WTB", name: "Wireless Telecommunications Bureau" },
  { code: "OET", name: "Office of Engineering and Technology" },
  { code: "SB", name: "Space Bureau" },
];

let seq = 0;

/** A confirmed in-person visit from Japan on Tuesday, October 6, 2026 at 10 AM in Washington, unless told otherwise. */
export function makeReachMeeting(over: Partial<ReachMeeting> = {}): ReachMeeting {
  seq += 1;
  return {
    id: `mtg_${seq}`,
    code: `IVP-2026-${String(seq).padStart(3, "0")}`,
    title: `Visit ${seq}`,
    status: "confirmed",
    format: "in_person",
    start: new Date("2026-10-06T14:00:00Z"),
    proposed: false,
    countries: ["JP"],
    orgName: "Ministry of Internal Affairs and Communications",
    region: "Asia-Pacific",
    participants: 6,
    topics: ["Spectrum policy"],
    bureaus: ["WTB"],
    och: false,
    highPriority: false,
    readiness: 60,
    missing: [],
    waiting: null,
    lead: "Dana Whitfield",
    delegationSize: 6,
    experts: [],
    ...over,
  };
}

export function makeReachData(meetings: ReachMeeting[]): ReachData {
  return { asOf: REACH_NOW, meetings, countries: REACH_COUNTRIES, bureaus: REACH_BUREAUS };
}
