import { formatNumber } from "@/lib/format";

/**
 * The words on the executive dashboard's program band. Everything here is a
 * pure function of figures already computed elsewhere — the band never counts
 * anything itself, it only says what the tallies mean in one plain sentence.
 */

/** Where the fiscal year being read sits relative to today. */
export type GlanceTense = "current" | "past" | "future";

export type GlanceInput = {
  engagements: number;
  countries: number;
  participants: number;
  fiscalYear: number;
  tense: GlanceTense;
  /** True for a reader who only sees the meetings they brief (an FCC expert). */
  scoped: boolean;
};

/** 2026 → "FY26". */
export function fyLabel(fy: number): string {
  return `FY${String(fy).slice(-2)}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * One sentence for the top of the dashboard: how much the program did, where,
 * and for how many people. Reads for a coordinator ("46 engagements…") and for
 * an expert ("6 of your briefings…") without either sounding like the other.
 */
export function glanceHeadline({ engagements, countries, participants, fiscalYear, tense, scoped }: GlanceInput): string {
  const label = fyLabel(fiscalYear);
  if (tense === "future") return `Nothing counted yet for ${label}.`;

  const current = tense === "current";
  if (engagements <= 0) {
    if (scoped) return current ? "None of your briefings are counted yet this fiscal year." : `None of your briefings were counted in ${label}.`;
    return current ? "No engagements counted yet this fiscal year." : `No engagements counted in ${label}.`;
  }

  const subject = scoped ? `${formatNumber(engagements)} of your briefings` : `${formatNumber(engagements)} ${plural(engagements, "engagement", "engagements")}`;
  const where = `${formatNumber(countries)} ${plural(countries, "country", "countries")}`;
  const when = current ? "this fiscal year" : `in ${label}`;
  const who = `${formatNumber(participants)} ${plural(participants, "foreign official", "foreign officials")}`;
  return `${subject} across ${where} ${when}, reaching ${who}.`;
}
