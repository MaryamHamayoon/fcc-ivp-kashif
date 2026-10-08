import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { can } from "@/lib/domain/policy";

export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "That meeting could not be found." }, { status: 404 });

/**
 * GET /api/meetings/:id → the full meeting record.
 * A meeting the reader may not see answers 404 rather than 403: the existence of a
 * visit is itself information, and an expert has no business enumerating the program.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;
  const meeting = await makeMeetingsRepo(await getDb()).get(id);
  if (!meeting) return notFound();

  const subject = { kind: "meeting" as const, regionId: meeting.regionId, assignedStaffIds: meeting.experts.map((e) => e.staffId) };
  if (!can(toPolicyUser(user), "meeting.read", subject)) return notFound();

  return NextResponse.json(meeting);
}
