import { eq, inArray, sql } from "drizzle-orm";
import type { ExpertRow, ParticipantRow } from "@/lib/domain/reports";
import type { Db } from "../factory";
import * as s from "../schema";

/**
 * The two thin row sets the reports need beyond the meetings list: who was expected and who
 * came, by category; and which expert each bureau lent, with the dates that say how long
 * they took to answer. Both are read for a known set of meetings, never for the whole table.
 */
export function makeReportsRepo(db: Db) {
  return {
    async participantRows(meetingIds: string[]): Promise<ParticipantRow[]> {
      if (meetingIds.length === 0) return [];
      const rows = await db
        .select({ meetingId: s.meetingParticipantTotals.meetingId, category: s.meetingParticipantTotals.category, planned: s.meetingParticipantTotals.planned, actual: s.meetingParticipantTotals.actual })
        .from(s.meetingParticipantTotals)
        .where(inArray(s.meetingParticipantTotals.meetingId, meetingIds));
      return rows.map((r) => ({ meetingId: r.meetingId, category: r.category, planned: r.planned, actual: r.actual }));
    },

    async expertRows(meetingIds: string[]): Promise<ExpertRow[]> {
      if (meetingIds.length === 0) return [];
      // The bureau on the engagement wins; the expert's home bureau stands in when it was not recorded.
      const bureauCode = sql<string | null>`coalesce(${s.meetingExperts.bureauCode}, ${s.staffDirectory.bureauCode})`;
      const rows = await db
        .select({
          meetingId: s.meetingExperts.meetingId,
          staffId: s.meetingExperts.staffId,
          name: s.staffDirectory.name,
          bureauCode,
          bureauName: s.bureaus.name,
          status: s.meetingExperts.status,
          requestedAt: s.meetingExperts.requestedAt,
          respondedAt: s.meetingExperts.respondedAt,
        })
        .from(s.meetingExperts)
        .innerJoin(s.staffDirectory, eq(s.staffDirectory.id, s.meetingExperts.staffId))
        .leftJoin(s.bureaus, eq(s.bureaus.code, bureauCode))
        .where(inArray(s.meetingExperts.meetingId, meetingIds));
      return rows.map((r) => ({
        meetingId: r.meetingId,
        staffId: r.staffId,
        name: r.name,
        bureauCode: r.bureauCode,
        bureauName: r.bureauName ?? null,
        status: r.status,
        requestedAt: r.requestedAt ?? null,
        respondedAt: r.respondedAt ?? null,
      }));
    },
  };
}

export type ReportsRepo = ReturnType<typeof makeReportsRepo>;
