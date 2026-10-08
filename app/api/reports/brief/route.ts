import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { fiscalYearOf } from "@/lib/domain/fiscal-year";
import { renderBriefPdf } from "@/lib/reports/brief";
import { isAppError } from "@/lib/services/errors";
import { loadBrief } from "@/lib/services/reports";

/**
 * GET /api/reports/brief?fy=2026
 *
 * The one-page executive brief as a PDF. The year defaults to the current fiscal year; the
 * brief carries no other filter, since a director reads the program, not a slice of it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const Query = z.object({ fy: z.coerce.number().int().min(2000).max(2100).optional() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to download the brief." }, { status: 401 });

  const parsed = Query.safeParse({ fy: request.nextUrl.searchParams.get("fy") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "That fiscal year is not valid." }, { status: 422 });
  const now = new Date();
  const fy = parsed.data.fy ?? fiscalYearOf(now);

  try {
    const db = await getDb();
    const brief = await loadBrief(db, fy, toPolicyUser(user), now);
    const bytes = await renderBriefPdf(brief);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ivp-executive-brief-${brief.fyLabel}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isAppError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[brief] PDF render failed", error);
    return NextResponse.json({ error: "Couldn't build the PDF." }, { status: 500 });
  }
}
