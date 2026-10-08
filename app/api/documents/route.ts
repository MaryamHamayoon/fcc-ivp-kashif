import { NextResponse, type NextRequest } from "next/server";
import { parseDocumentLibraryQuery } from "@/lib/api/schemas";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { isAppError } from "@/lib/services/errors";
import { listLibrary } from "@/lib/services/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents?kind=…&topicId=…&q=… → { items, total, page, pageSize }.
 * The library keeps its filters in the URL and hands them straight to this route; the service
 * narrows the shelf to what the caller may read.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = parseDocumentLibraryQuery(req.nextUrl.searchParams);
  if (!parsed.success) return NextResponse.json({ error: "Those filters are not valid." }, { status: 422 });
  const query = parsed.data;

  try {
    const { items, total } = await listLibrary(await getDb(), query, toPolicyUser(user));
    return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
