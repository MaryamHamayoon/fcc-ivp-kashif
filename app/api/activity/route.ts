import { NextResponse, type NextRequest } from "next/server";
import { parseActivityFeedQuery } from "@/lib/api/schemas";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { listActivity } from "@/lib/services/activity-feed";
import { isAppError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity?scope=…&kind=…&q=… → { items, total, page, pageSize, counts, pulse }.
 * The Activity page keeps its filters in the URL and hands them straight to this route; the
 * service narrows the log to the meetings the caller may read.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = parseActivityFeedQuery(req.nextUrl.searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Those filters are not valid." }, { status: 422 });
  const query = parsed.data;

  try {
    const feed = await listActivity(await getDb(), query, toPolicyUser(user));
    return NextResponse.json({ ...feed, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
