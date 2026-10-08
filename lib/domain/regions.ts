/**
 * OIA's seven working regions (State-Department style) and the mapping from UN M49
 * region/subregion (as shipped by `world-countries`) onto them.
 */
export const OIA_REGIONS = [
  { id: "af", name: "Africa" },
  { id: "wha", name: "Americas" },
  { id: "eap", name: "Asia-Pacific" },
  { id: "eur", name: "Europe" },
  { id: "nea", name: "Middle East & North Africa" },
  { id: "sca", name: "South & Central Asia" },
  { id: "io", name: "Multilateral & International Organizations" },
] as const;

export type RegionId = (typeof OIA_REGIONS)[number]["id"];

export const REGION_NAMES: Record<RegionId, string> = Object.fromEntries(OIA_REGIONS.map((r) => [r.id, r.name])) as Record<
  RegionId,
  string
>;

/** Short labels for tight spaces (KPI chips, legend). */
export const REGION_SHORT_NAMES: Record<RegionId, string> = {
  af: "Africa",
  wha: "Americas",
  eap: "Asia-Pacific",
  eur: "Europe",
  nea: "MENA",
  sca: "S. & Central Asia",
  io: "Multilateral",
};

const SHORT_BY_NAME = new Map<string, string>(OIA_REGIONS.map((r) => [r.name, REGION_SHORT_NAMES[r.id]]));

/** The short label for a region known only by its full name, which is how tallies carry it. */
export function shortRegionName(name: string): string {
  return SHORT_BY_NAME.get(name) ?? name;
}

const WESTERN_ASIA_TO_EUROPE = new Set(["AM", "AZ", "GE", "CY", "TR"]);
const EAP_SUBREGIONS = new Set(["Eastern Asia", "South-Eastern Asia", "Australia and New Zealand", "Melanesia", "Micronesia", "Polynesia"]);

export function regionForCountry(c: { cca2: string; region: string; subregion: string }): RegionId {
  if (c.subregion === "Northern Africa") return "nea";
  if (c.region === "Africa") return "af";
  if (c.subregion === "Western Asia") return WESTERN_ASIA_TO_EUROPE.has(c.cca2) ? "eur" : "nea";
  if (c.subregion === "Southern Asia" || c.subregion === "Central Asia") return "sca";
  if (EAP_SUBREGIONS.has(c.subregion)) return "eap";
  if (c.region === "Europe") return "eur";
  if (c.region === "Americas") return "wha";
  return "io";
}

/** Names OIA uses that differ from `world-countries` common names. */
export const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  CI: "Côte d'Ivoire",
  TR: "Türkiye",
  CV: "Cabo Verde",
  CZ: "Czechia",
  SZ: "Eswatini",
  MK: "North Macedonia",
  CD: "Democratic Republic of the Congo",
  CG: "Republic of the Congo",
  KR: "Republic of Korea",
  KP: "DPR Korea",
  FM: "Micronesia (Federated States)",
  VA: "Holy See",
  TL: "Timor-Leste",
  MM: "Myanmar",
  LA: "Lao PDR",
  BN: "Brunei Darussalam",
  SY: "Syria",
  IR: "Iran",
  RU: "Russia",
  VN: "Vietnam",
  BO: "Bolivia",
  VE: "Venezuela",
  TZ: "Tanzania",
  MD: "Moldova",
  PS: "Palestinian Territories",
  TW: "Taiwan",
};

/** Uninhabited or research-only territories that never send delegations. */
export const EXCLUDED_COUNTRY_CODES = new Set(["AQ", "BV", "HM", "TF", "UM", "GS", "SJ", "IO"]);
