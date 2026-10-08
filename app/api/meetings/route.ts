import { NextResponse, type NextRequest } from "next/server";
import { parseMeetingListQuery } from "@/lib/api/schemas";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { makeMeetingsRepo } from "@/lib/db/repos/meetings";
import { readableScope } from "@/lib/domain/policy";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings?view=…&status=…&q=… → { items, total, page, pageSize }.
 * The meetings workspace keeps its filters in the URL and hands them straight to this route.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = parseMeetingListQuery(req.nextUrl.searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Those filters are not valid." }, { status: 422 });
  const query = parsed.data;

  const repo = makeMeetingsRepo(await getDb());
  const { items, total } = await repo.list(query, readableScope(toPolicyUser(user)), new Date());
  return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize });
}
