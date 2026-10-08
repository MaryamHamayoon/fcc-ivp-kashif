import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/factory";
import * as s from "@/lib/db/schema";
import type { MeetingRow } from "@/lib/db/types";
import { can, type Action, type PolicyUser, type Subject } from "@/lib/domain/policy";
import { NotFoundError, PolicyError } from "./errors";

export function assertCan(actor: PolicyUser, action: Action, subject: Subject): void {
  if (!can(actor, action, subject)) throw new PolicyError();
}

export type MeetingContext = { meeting: MeetingRow; subject: Subject; assignedStaffIds: string[] };

/** Loads the meeting row plus the policy subject (region + assigned staff) in one go. */
export async function meetingContext(db: Db, meetingId: string): Promise<MeetingContext> {
  const [meeting] = await db.select().from(s.meetings).where(eq(s.meetings.id, meetingId)).limit(1);
  if (!meeting) throw new NotFoundError("Meeting");
  const experts = await db.select({ staffId: s.meetingExperts.staffId }).from(s.meetingExperts).where(eq(s.meetingExperts.meetingId, meetingId));
  const assignedStaffIds = experts.map((e) => e.staffId);
  return { meeting, subject: { kind: "meeting", regionId: meeting.regionId, assignedStaffIds }, assignedStaffIds };
}

export async function requireMeeting(db: Db, meetingId: string, actor: PolicyUser, action: Action): Promise<MeetingContext> {
  const ctx = await meetingContext(db, meetingId);
  assertCan(actor, action, ctx.subject);
  return ctx;
}
