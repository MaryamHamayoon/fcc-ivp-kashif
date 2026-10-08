/**
 * Topic taxonomy. `bureaus` is seed-only metadata: which FCC bureaus/offices usually
 * supply the expert briefer for the topic.
 */
export type TopicFixture = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  sortOrder: number;
  bureaus: readonly string[];
};

type ChildDef = readonly [id: string, name: string, bureaus?: readonly string[]];
type Group = { id: string; name: string; bureaus: readonly string[]; children?: readonly ChildDef[] };

const GROUPS: readonly Group[] = [
  {
    id: "spectrum",
    name: "Spectrum",
    bureaus: ["WTB", "OET", "OEA"],
    children: [
      ["spectrum-valuation", "Spectrum Valuation", ["OEA", "WTB"]],
      ["spectrum-allocation", "Spectrum Allocation", ["OET", "WTB"]],
      ["spectrum-auctions", "Spectrum Auctions", ["OEA", "WTB"]],
      ["spectrum-sharing", "Spectrum Sharing & CBRS", ["WTB", "OET"]],
      ["imt", "IMT / 5G / 6G", ["WTB", "OET", "OIA"]],
    ],
  },
  {
    id: "satellite",
    name: "Satellite",
    bureaus: ["SB", "OET"],
    children: [
      ["satellite-licensing", "Satellite Licensing", ["SB"]],
      ["ngso", "NGSO / LEO Constellations", ["SB", "OET"]],
      ["space-bureau-processes", "Space Bureau Processes", ["SB"]],
      ["orbital-debris", "Orbital Debris", ["SB"]],
    ],
  },
  {
    id: "broadband",
    name: "Broadband",
    bureaus: ["WCB", "OEA"],
    children: [
      ["universal-service", "Universal Service", ["WCB"]],
      ["broadband-deployment", "Broadband Deployment", ["WCB", "WTB"]],
      ["broadband-mapping", "Broadband Mapping", ["OEA", "WCB"]],
      ["affordability", "Affordability", ["WCB", "CGB"]],
    ],
  },
  {
    id: "wireless",
    name: "Wireless",
    bureaus: ["WTB", "CGB"],
    children: [
      ["number-portability", "Number Portability", ["WCB", "WTB"]],
      ["robocalls", "Robocalls & STIR/SHAKEN", ["CGB", "EB", "WCB"]],
      ["v2x", "V2X & Connected Vehicles", ["OET", "WTB", "PSHSB"]],
      ["open-ran", "Open RAN", ["OET", "WTB", "OIA"]],
    ],
  },
  {
    id: "media",
    name: "Media",
    bureaus: ["MB"],
    children: [
      ["broadcast", "Broadcast Regulation", ["MB"]],
      ["atsc3", "ATSC 3.0 / NextGen TV", ["MB", "OET"]],
    ],
  },
  {
    id: "public-safety",
    name: "Public Safety",
    bureaus: ["PSHSB"],
    children: [
      ["emergency-alerts", "Emergency Alerts (EAS / WEA)", ["PSHSB"]],
      ["ng911", "911 / NG911", ["PSHSB"]],
      ["resiliency", "Network Resiliency", ["PSHSB", "WCB"]],
    ],
  },
  {
    id: "consumer",
    name: "Consumer",
    bureaus: ["CGB"],
    children: [
      ["accessibility", "Accessibility", ["CGB"]],
      ["digital-inclusion", "Digital Inclusion", ["CGB", "WCB"]],
    ],
  },
  { id: "submarine-cables", name: "Submarine Cables", bureaus: ["OIA", "WCB"] },
  { id: "enforcement", name: "Enforcement", bureaus: ["EB"] },
  { id: "ai-networks", name: "AI in Networks", bureaus: ["OET", "OEA"] },
  { id: "cybersecurity", name: "Cybersecurity & Supply Chain", bureaus: ["PSHSB", "OET", "OIA"] },
  { id: "data-analytics", name: "Data Collection & Analytics", bureaus: ["OEA"] },
  { id: "rulemaking", name: "Rulemaking Process", bureaus: ["OGC", "OMD"] },
  { id: "governance", name: "FCC Organization & Governance", bureaus: ["OMD", "OGC", "OLA"] },
  { id: "equipment-authorization", name: "Equipment Authorization", bureaus: ["OET"] },
];

export const TOPICS: readonly TopicFixture[] = GROUPS.flatMap((g, gi) => [
  { id: g.id, name: g.name, slug: g.id, parentId: null, sortOrder: (gi + 1) * 10, bureaus: g.bureaus },
  ...(g.children ?? []).map(([id, name, bureaus], ci) => ({
    id,
    name,
    slug: id,
    parentId: g.id,
    sortOrder: (gi + 1) * 10 + ci + 1,
    bureaus: bureaus ?? g.bureaus,
  })),
]);

/** Leaf topics — what meetings are actually about. */
export const LEAF_TOPICS: readonly TopicFixture[] = TOPICS.filter((t) => !TOPICS.some((o) => o.parentId === t.id));
