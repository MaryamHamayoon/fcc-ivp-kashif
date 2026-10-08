import { readFileSync } from "node:fs";
import { FIXTURES_FILE } from "./paths";

/** Seeded ids discovered by `global-setup.ts`; nothing in the suite hardcodes one. */
export type Fixtures = {
  /** The demo identity the run signed in as, for the report. */
  identity: string;
  /** A meeting that still has an onward status move. */
  meetingId: string;
  meetingCode: string;
  meetingStatus: string;
  /** A country that has a dossier page. */
  countryCode: string;
  /** An organization that has a dossier page. */
  organizationId: string;
  /** A document the signed-in identity may open in the library's drawer. */
  documentId: string;
  meetingCount: number;
};

let cached: Fixtures | null = null;

export function fixtures(): Fixtures {
  cached ??= JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as Fixtures;
  return cached;
}

/** The record and every tab of it, as `[label, path]` pairs. */
export function recordPaths(): [label: string, path: string][] {
  const base = `/meetings/${fixtures().meetingId}`;
  return [
    ["record-overview", base],
    ["record-people", `${base}/people`],
    ["record-schedule", `${base}/schedule`],
    ["record-agenda", `${base}/agenda`],
    ["record-documents", `${base}/documents`],
    ["record-activity", `${base}/activity`],
  ];
}

/** The seven reports, as `[label, path]` pairs. */
export function reportPaths(): [label: string, path: string][] {
  return ["summary", "tally", "participants", "experts", "countries", "tracker", "custom"].map((report) => [`reports-${report}`, report === "summary" ? "/reports" : `/reports?report=${report}`]);
}
