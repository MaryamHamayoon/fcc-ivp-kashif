import { sql } from "drizzle-orm";
import { DOCUMENT_KIND_LABELS, type DocumentKind, type MeetingStatus } from "@/lib/domain/types";
import { execRows, type Db } from "../factory";

export type SearchHitKind = "meeting" | "organization" | "country" | "staff" | "topic" | "activity" | "document";

export type SearchHit = {
  kind: SearchHitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  score: number;
  /** Extra display hints: ISO country code for a flag, meeting status for a badge. */
  countryCode?: string;
  status?: MeetingStatus;
};

const FOLD_FROM = "àáâäãåāçčćèéêëēìíîïñòóôöõøùúûüýÿšžłń";
const FOLD_TO = "aaaaaaacceeeeeiiiinooooooouuuuyyszln";
/** Accent-insensitive lower-casing in SQL, so "cote" finds Côte d'Ivoire without the unaccent extension. */
const fold = (expr: string) => sql.raw(`translate(lower(${expr}), '${FOLD_FROM}', '${FOLD_TO}')`);

export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const escapeLike = (q: string) => q.replace(/[%_\\]/g, (c) => `\\${c}`);

/** Runs the per-kind queries and returns unsorted hits; services/search.ts ranks and trims them. */
export async function searchAll(db: Db, query: string, limit: number): Promise<SearchHit[]> {
  const q = query.trim();
  const qf = foldText(q);
  const pattern = `%${escapeLike(qf)}%`;
  const per = Math.max(5, Math.ceil(limit / 2));

  const [meetings, organizations, countries, staff, topics, activities, documents] = await Promise.all([
    execRows<{ id: string; code: string; title: string; status: MeetingStatus; cca2: string; org: string | null; org_short: string | null; country: string; scheduled_start: string | null; rank: number; sim: number; code_match: boolean }>(
      db,
      sql`
        WITH docs AS (
          SELECT m.id, m.code, m.title, m.status, m.scheduled_start, m.primary_country_code AS cca2,
                 o.name AS org, o.short_name AS org_short, c.name AS country,
                 to_tsvector('english',
                   coalesce(m.title, '') || ' ' || coalesce(m.purpose, '') || ' ' || coalesce(o.name, '') || ' ' ||
                   coalesce(o.short_name, '') || ' ' || coalesce(c.name, '') || ' ' || coalesce(string_agg(t.name, ' '), '')) AS doc
          FROM meetings m
          LEFT JOIN organizations o ON o.id = m.organization_id
          LEFT JOIN countries c ON c.cca2 = m.primary_country_code
          LEFT JOIN meeting_topics mt ON mt.meeting_id = m.id
          LEFT JOIN topics t ON t.id = mt.topic_id
          GROUP BY m.id, o.name, o.short_name, c.name)
        SELECT * FROM (
        SELECT id, code, title, status, scheduled_start, cca2, org, org_short, country,
               ts_rank(doc, plainto_tsquery('english', ${q})) AS rank,
               greatest(similarity(${fold("coalesce(org_short, '')")}, ${qf}),
                        similarity(${fold("coalesce(org, '')")}, ${qf}),
                        similarity(${fold("coalesce(country, '')")}, ${qf}),
                        similarity(${fold("title")}, ${qf})) AS sim,
               (lower(code) = lower(${q}) OR lower(code) LIKE lower(${q}) || '%') AS code_match
        FROM docs
        WHERE doc @@ plainto_tsquery('english', ${q})
           OR lower(code) LIKE ${`%${escapeLike(q.toLowerCase())}%`}
           OR similarity(${fold("coalesce(org_short, '')")}, ${qf}) > 0.3
           OR similarity(${fold("coalesce(org, '')")}, ${qf}) > 0.3
           OR similarity(${fold("coalesce(country, '')")}, ${qf}) > 0.3
           OR similarity(${fold("title")}, ${qf}) > 0.3
        ) ranked
        ORDER BY code_match DESC, greatest(rank * 5, sim) DESC, scheduled_start DESC NULLS LAST
        LIMIT ${per * 2}`,
    ),
    execRows<{ id: string; name: string; short_name: string | null; country: string | null; cca2: string | null; sim: number; exact: boolean; prefix: boolean; meetings: number }>(
      db,
      sql`
        SELECT o.id, o.name, o.short_name, c.name AS country, c.cca2,
               greatest(similarity(${fold("coalesce(o.short_name, '')")}, ${qf}), similarity(${fold("o.name")}, ${qf})) AS sim,
               (${fold("coalesce(o.short_name, '')")} = ${qf} OR ${fold("o.name")} = ${qf}) AS exact,
               (${fold("coalesce(o.short_name, '')")} LIKE ${`${escapeLike(qf)}%`} OR ${fold("o.name")} LIKE ${`${escapeLike(qf)}%`}) AS prefix,
               (SELECT count(*)::int FROM meetings m WHERE m.organization_id = o.id) AS meetings
        FROM organizations o LEFT JOIN countries c ON c.cca2 = o.country_code
        WHERE ${fold("coalesce(o.short_name, '')")} LIKE ${pattern} OR ${fold("o.name")} LIKE ${pattern}
           OR similarity(${fold("coalesce(o.short_name, '')")}, ${qf}) > 0.3 OR similarity(${fold("o.name")}, ${qf}) > 0.3
        ORDER BY exact DESC, prefix DESC, sim DESC LIMIT ${per}`,
    ),
    execRows<{ cca2: string; name: string; region: string; sim: number; exact: boolean; prefix: boolean; meetings: number }>(
      db,
      sql`
        SELECT c.cca2, c.name, r.name AS region, similarity(${fold("c.name")}, ${qf}) AS sim,
               (${fold("c.name")} = ${qf} OR lower(c.cca2) = ${qf} OR lower(c.cca3) = ${qf}) AS exact,
               (${fold("c.name")} LIKE ${`${escapeLike(qf)}%`}) AS prefix,
               (SELECT count(*)::int FROM meetings m WHERE m.primary_country_code = c.cca2) AS meetings
        FROM countries c JOIN regions r ON r.id = c.region_id
        WHERE ${fold("c.name")} LIKE ${pattern} OR similarity(${fold("c.name")}, ${qf}) > 0.3 OR lower(c.cca2) = ${qf} OR lower(c.cca3) = ${qf}
        ORDER BY exact DESC, prefix DESC, sim DESC LIMIT ${per}`,
    ),
    execRows<{ id: string; name: string; title: string | null; bureau: string | null; sim: number; exact: boolean; prefix: boolean }>(
      db,
      sql`
        SELECT st.id, st.name, st.title, st.bureau_code AS bureau, similarity(${fold("st.name")}, ${qf}) AS sim,
               (${fold("st.name")} = ${qf}) AS exact, (${fold("st.name")} LIKE ${`${escapeLike(qf)}%`}) AS prefix
        FROM staff_directory st
        WHERE st.active AND (${fold("st.name")} LIKE ${pattern} OR similarity(${fold("st.name")}, ${qf}) > 0.35 OR lower(st.email) LIKE ${pattern})
        ORDER BY exact DESC, prefix DESC, sim DESC LIMIT ${per}`,
    ),
    execRows<{ id: string; name: string; parent: string | null; sim: number; meetings: number }>(
      db,
      sql`
        SELECT t.id, t.name, p.name AS parent, similarity(${fold("t.name")}, ${qf}) AS sim,
               (SELECT count(*)::int FROM meeting_topics mt WHERE mt.topic_id = t.id) AS meetings
        FROM topics t LEFT JOIN topics p ON p.id = t.parent_id
        WHERE ${fold("t.name")} LIKE ${pattern} OR similarity(${fold("t.name")}, ${qf}) > 0.3
        ORDER BY sim DESC LIMIT 5`,
    ),
    execRows<{ id: string; meeting_id: string; code: string; body: string; kind: string; occurred_at: string }>(
      db,
      sql`
        SELECT a.id, a.meeting_id, m.code, a.body, a.kind, a.occurred_at
        FROM activities a JOIN meetings m ON m.id = a.meeting_id
        WHERE ${fold("a.body")} LIKE ${pattern}
        ORDER BY a.occurred_at DESC LIMIT 5`,
    ),
    execRows<{ id: string; title: string; kind: DocumentKind; version: number; meeting_id: string; code: string; country: string; cca2: string; sim: number }>(
      db,
      sql`
        SELECT d.id, d.title, d.kind, d.version, m.id AS meeting_id, m.code, c.name AS country, c.cca2,
               similarity(${fold("d.title")}, ${qf}) AS sim
        FROM meeting_documents d
        JOIN meetings m ON m.id = d.meeting_id
        JOIN countries c ON c.cca2 = m.primary_country_code
        WHERE ${fold("d.title")} LIKE ${pattern} OR similarity(${fold("d.title")}, ${qf}) > 0.3
        ORDER BY sim DESC, d.added_at DESC LIMIT 5`,
    ),
  ]);

  const hits: SearchHit[] = [];
  for (const m of meetings) {
    const base = m.code_match ? (m.code.toLowerCase() === q.toLowerCase() ? 1.6 : 1.3) : Math.max(Number(m.rank) * 5, Number(m.sim));
    hits.push({
      kind: "meeting",
      id: m.id,
      title: m.title,
      subtitle: `${m.code} · ${m.org_short ?? m.org ?? "—"} · ${m.country}`,
      href: `/meetings/${m.id}`,
      score: Math.min(base, 1.6),
      countryCode: m.cca2,
      status: m.status,
    });
  }
  for (const o of organizations) {
    hits.push({
      kind: "organization",
      id: o.id,
      title: o.short_name ? `${o.short_name} — ${o.name}` : o.name,
      subtitle: `${o.country ?? "International"} · ${o.meetings} meeting${o.meetings === 1 ? "" : "s"}`,
      href: `/directory/organizations/${o.id}`,
      score: o.exact ? 1.5 : o.prefix ? 1.2 : Number(o.sim) + 0.2,
      countryCode: o.cca2 ?? undefined,
    });
  }
  for (const c of countries) {
    hits.push({
      kind: "country",
      id: c.cca2,
      title: c.name,
      subtitle: `${c.region} · ${c.meetings} meeting${c.meetings === 1 ? "" : "s"}`,
      href: `/countries/${c.cca2}`,
      score: c.exact ? 1.45 : c.prefix ? 1.15 : Number(c.sim) + 0.2,
      countryCode: c.cca2,
    });
  }
  for (const p of staff) {
    hits.push({
      kind: "staff",
      id: p.id,
      title: p.name,
      subtitle: [p.title, p.bureau].filter(Boolean).join(" · ") || "FCC staff",
      href: `/directory/staff/${p.id}`,
      score: p.exact ? 1.4 : p.prefix ? 1.1 : Number(p.sim) + 0.1,
    });
  }
  for (const t of topics) {
    hits.push({
      kind: "topic",
      id: t.id,
      title: t.name,
      subtitle: `${t.parent ? `${t.parent} · ` : ""}${t.meetings} meeting${t.meetings === 1 ? "" : "s"}`,
      href: `/meetings?view=all&topicId=${encodeURIComponent(t.id)}`,
      score: Number(t.sim) + 0.15,
    });
  }
  for (const a of activities) {
    hits.push({
      kind: "activity",
      id: a.id,
      title: a.body.length > 90 ? `${a.body.slice(0, 87)}…` : a.body,
      subtitle: `${a.code} · ${a.kind.replace(/_/g, " ")}`,
      href: `/meetings/${a.meeting_id}#activity-${a.id}`,
      score: 0.25,
    });
  }
  for (const d of documents) {
    hits.push({
      kind: "document",
      id: d.id,
      title: d.title,
      subtitle: `${DOCUMENT_KIND_LABELS[d.kind]} · ${d.code} · ${d.country}`,
      href: `/documents?doc=${encodeURIComponent(d.id)}`,
      score: Number(d.sim) + 0.1,
      countryCode: d.cca2,
    });
  }
  return hits;
}
