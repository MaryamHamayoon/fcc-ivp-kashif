import type { Db } from "@/lib/db/factory";
import { searchAll, type SearchHit, type SearchHitKind } from "@/lib/db/repos/search";

export type { SearchHit, SearchHitKind };

export function normalizeQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

const KIND_ORDER: SearchHitKind[] = ["meeting", "organization", "country", "staff", "topic", "activity", "document"];

/** Global search across meetings, organizations, countries, staff, topics, notes and documents. */
export async function search(db: Db, raw: string, limit = 20): Promise<SearchHit[]> {
  const q = normalizeQuery(raw);
  if (q.length < 2) return [];
  const hits = await searchAll(db, q, limit);
  const seen = new Set<string>();
  return hits
    .sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, "en"))
    .filter((h) => {
      const key = `${h.kind}:${h.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** Hits grouped for the palette and the results page, in a stable kind order. */
export function groupHits(hits: SearchHit[]): { kind: SearchHitKind; label: string; hits: SearchHit[] }[] {
  const labels: Record<SearchHitKind, string> = { meeting: "Meetings", organization: "Organizations", country: "Countries", staff: "People", topic: "Topics", activity: "Notes", document: "Documents" };
  return KIND_ORDER.map((kind) => ({ kind, label: labels[kind], hits: hits.filter((h) => h.kind === kind) })).filter((g) => g.hits.length > 0);
}
