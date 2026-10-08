import { NextResponse, type NextRequest } from "next/server";
import { SearchQuery } from "@/lib/api/schemas";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { search } from "@/lib/services/search";

export const dynamic = "force-dynamic";

/** GET /api/search?q=…&limit=… → { hits } ranked across meetings, organizations, countries, people, topics and notes. */
export async function GET(req: NextRequest) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const parsed = SearchQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Search for 2 to 80 characters." }, { status: 422 });
  const hits = await search(await getDb(), parsed.data.q, parsed.data.limit);
  return NextResponse.json({ hits });
}
