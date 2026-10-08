import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { isAppError } from "@/lib/services/errors";
import { getDocumentDetail } from "@/lib/services/library";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/:id → { item, versions, source }: what the drawer shows. A document the
 * reader may not see is a 404, never a 403, so the route cannot be used to probe the shelf.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;

  try {
    return NextResponse.json(await getDocumentDetail(await getDb(), id, toPolicyUser(user)));
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
