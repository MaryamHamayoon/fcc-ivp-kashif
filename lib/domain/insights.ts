import { countBy, type TallyMeeting } from "./tallies";
import { FORMAT_LABELS, type MeetingFormat } from "./types";

/**
 * The shaped numbers behind the dashboard's two insight visuals: how the year's meetings split
 * across formats (and how that moved against last year), and which regions raised which topics.
 * Callers pass the meetings that count; nothing here decides what "counted" means.
 */

export type FormatShare = {
  key: MeetingFormat;
  label: string;
  count: number;
  /** Foreign officials across this format's meetings this year. */
  participants: number;
  /** 0–1 of this year's meetings. */
  share: number;
  /** 0–1 of last year's meetings; null when last year has none to compare with. */
  priorShare: number | null;
  /** This year's share minus last year's, in whole percentage points. */
  deltaPoints: number | null;
};

/** Formats used in either year, largest this year first; a format dropped since last year stays, at zero. */
export function formatShares(current: TallyMeeting[], prior: TallyMeeting[]): FormatShare[] {
  if (current.length === 0) return [];
  const priorCounts = new Map(countBy(prior, (m) => m.format).map((c) => [c.key, c.count]));
  const rows: FormatShare[] = [];
  for (const key of Object.keys(FORMAT_LABELS) as MeetingFormat[]) {
    const mine = current.filter((m) => m.format === key);
    const before = priorCounts.get(key) ?? 0;
    if (mine.length === 0 && before === 0) continue;
    const share = mine.length / current.length;
    const priorShare = prior.length > 0 ? before / prior.length : null;
    rows.push({
      key,
      label: FORMAT_LABELS[key],
      count: mine.length,
      participants: mine.reduce((sum, m) => sum + m.participantTotal, 0),
      share,
      priorShare,
      deltaPoints: priorShare === null ? null : Math.round((share - priorShare) * 100),
    });
  }
  return rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export type TopicFlows = {
  /** The top topics by the meetings that took them up, most first. */
  topics: { key: string; label: string; meetings: number }[];
  /**
   * Regions that raised any of those topics, by `mentions` (meeting–topic pairs, which is what a
   * region's node is as tall as); `meetings` is how many distinct meetings that was.
   */
  regions: { key: string; label: string; meetings: number; mentions: number }[];
  /** Region → topic, counting meetings; ordered as the regions, then as the topics. */
  links: { region: string; topic: string; count: number }[];
  /**
   * Countries whose meetings raised any of the topics shown, for the drill-down from a region.
   * A country belongs to the region its MEETING was filed under, so one country can appear
   * under two regions (a multilateral meeting hosted in Geneva, a bilateral one with Switzerland);
   * the pair (region, key) is what is unique. `key` is the ISO 3166 alpha-2 code.
   * Ordered as the regions, then by mentions, most first, then by name.
   */
  countries: { key: string; label: string; region: string; meetings: number; mentions: number }[];
  /** Region's country → topic, counting meetings; ordered as the countries, then as the topics. */
  countryLinks: { region: string; country: string; topic: string; count: number }[];
  /** Topics discussed this year that fall outside the ones shown. */
  otherTopics: number;
};

/** A country's tally within one region, gathered alongside the region's own while walking the meetings once. */
type CountryTally = { label: string; meetings: number; mentions: number; topics: Map<string, number> };
type RegionTally = { meetings: number; mentions: number; topics: Map<string, number>; countries: Map<string, CountryTally> };

export function topicFlows(meetings: TallyMeeting[], topN: number): TopicFlows {
  const ranked = countBy(meetings, (m) => m.topics);
  const topics = ranked.slice(0, topN).map((t) => ({ key: t.key, label: t.label, meetings: t.count }));
  const shown = new Set(topics.map((t) => t.key));

  const byRegion = new Map<string, RegionTally>();
  for (const m of meetings) {
    const raised = m.topics.filter((t) => shown.has(t));
    if (raised.length === 0) continue;

    const region = byRegion.get(m.regionName) ?? { meetings: 0, mentions: 0, topics: new Map<string, number>(), countries: new Map<string, CountryTally>() };
    region.meetings += 1;
    region.mentions += raised.length;
    for (const t of raised) region.topics.set(t, (region.topics.get(t) ?? 0) + 1);

    const country = region.countries.get(m.countryCode) ?? { label: m.countryName, meetings: 0, mentions: 0, topics: new Map<string, number>() };
    country.meetings += 1;
    country.mentions += raised.length;
    for (const t of raised) country.topics.set(t, (country.topics.get(t) ?? 0) + 1);
    region.countries.set(m.countryCode, country);

    byRegion.set(m.regionName, region);
  }

  const regions = [...byRegion.entries()]
    .map(([key, row]) => ({ key, label: key, meetings: row.meetings, mentions: row.mentions }))
    .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));

  const links: TopicFlows["links"] = [];
  for (const region of regions) {
    for (const topic of topics) {
      const count = byRegion.get(region.key)?.topics.get(topic.key) ?? 0;
      if (count > 0) links.push({ region: region.key, topic: topic.key, count });
    }
  }

  const countries: TopicFlows["countries"] = [];
  for (const region of regions) {
    const rows = [...(byRegion.get(region.key)?.countries.entries() ?? [])]
      .map(([key, c]) => ({ key, label: c.label, region: region.key, meetings: c.meetings, mentions: c.mentions }))
      .sort((a, b) => b.mentions - a.mentions || a.label.localeCompare(b.label));
    countries.push(...rows);
  }

  const countryLinks: TopicFlows["countryLinks"] = [];
  for (const country of countries) {
    const topicCounts = byRegion.get(country.region)?.countries.get(country.key)?.topics;
    for (const topic of topics) {
      const count = topicCounts?.get(topic.key) ?? 0;
      if (count > 0) countryLinks.push({ region: country.region, country: country.key, topic: topic.key, count });
    }
  }

  return { topics, regions, links, countries, countryLinks, otherTopics: Math.max(0, ranked.length - topics.length) };
}

/** The key of the row that gathers the countries beyond the ones drawn. */
export const OTHER_COUNTRIES = "__other";

export type RegionTopicFlows = {
  region: string;
  /** The region's countries, most mentions first; past `maxCountries` the tail folds into one last row. */
  countries: { key: string; label: string; code: string | null; meetings: number; mentions: number }[];
  /** The topics this region raised, in the chart's own order, counted within the region. */
  topics: { key: string; label: string; meetings: number }[];
  /** Country → topic within the region; ordered as the countries, then as the topics. */
  links: { country: string; topic: string; count: number }[];
  /** How many countries the last row stands for; 0 when every country has a row of its own. */
  folded: number;
};

/**
 * One region's countries against the topics it raised, for the Topics chart's drill-down; null
 * for a region the flows never raised. Past `maxCountries`, the smallest countries fold into one
 * trailing row so the chart never grows past a fixed number of rows.
 */
export function regionTopicFlows(flows: TopicFlows, region: string, maxCountries: number): RegionTopicFlows | null {
  if (!flows.regions.some((r) => r.key === region)) return null;

  const linkByTopic = new Map(flows.links.filter((l) => l.region === region).map((l) => [l.topic, l.count]));
  const topics: RegionTopicFlows["topics"] = flows.topics
    .filter((t) => linkByTopic.has(t.key))
    .map((t) => ({ key: t.key, label: t.label, meetings: linkByTopic.get(t.key) ?? 0 }));

  const regionCountries = flows.countries.filter((c) => c.region === region);
  const fold = regionCountries.length > maxCountries;
  const visible = fold ? regionCountries.slice(0, maxCountries - 1) : regionCountries;
  const tail = fold ? regionCountries.slice(maxCountries - 1) : [];

  const linksByCountry = new Map<string, Map<string, number>>();
  for (const l of flows.countryLinks) {
    if (l.region !== region) continue;
    const perTopic = linksByCountry.get(l.country) ?? new Map<string, number>();
    perTopic.set(l.topic, l.count);
    linksByCountry.set(l.country, perTopic);
  }

  const countries: RegionTopicFlows["countries"] = visible.map((c) => ({ key: c.key, label: c.label, code: c.key, meetings: c.meetings, mentions: c.mentions }));
  const links: RegionTopicFlows["links"] = [];
  for (const c of visible) {
    for (const t of topics) {
      const count = linksByCountry.get(c.key)?.get(t.key) ?? 0;
      if (count > 0) links.push({ country: c.key, topic: t.key, count });
    }
  }

  if (fold) {
    countries.push({
      key: OTHER_COUNTRIES,
      label: `${tail.length} other countries`,
      code: null,
      meetings: tail.reduce((sum, c) => sum + c.meetings, 0),
      mentions: tail.reduce((sum, c) => sum + c.mentions, 0),
    });
    for (const t of topics) {
      const count = tail.reduce((sum, c) => sum + (linksByCountry.get(c.key)?.get(t.key) ?? 0), 0);
      if (count > 0) links.push({ country: OTHER_COUNTRIES, topic: t.key, count });
    }
  }

  return { region, countries, topics, links, folded: tail.length };
}
