import { NextResponse, type NextRequest } from "next/server";
import { parseMeetingListQuery } from "@/lib/api/schemas";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { readableScope } from "@/lib/domain/policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings/counts?q=…&regionId=… → { counts: { active, upcoming, developing, on_hold, completed, all } }.
 * The list's own filters, counted once per scope, so the scope tabs can say what each holds
 * before it is opened. `view`, the sort and the paging are accepted and ignored.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = parseMeetingListQuery(req.nextUrl.searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Those filters are not valid." }, { status: 422 });

  const repo = makeMeetingsRepo(await getDb());
  const counts = await repo.countByView(parsed.data, readableScope(toPolicyUser(user)), new Date());
  return NextResponse.json({ counts });
}
