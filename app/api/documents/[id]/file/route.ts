import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { ALLOWED_MIME, safeFilename } from "@/lib/domain/documents";
import { openDocument, type OpenedDocument } from "@/lib/services/documents";
import { isAppError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/documents/:id/file[?download=1] → the bytes, inline for the drawer's preview or as
 * an attachment for Download. Every answer is private and uncached: a document the reader may
 * not see is a 404, and one that only exists as a SharePoint link says so in JSON.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;

  let opened: OpenedDocument;
  try {
    opened = await openDocument(await getDb(), id, toPolicyUser(user));
  } catch (error) {
    if (isAppError(error) && error.status === 404) return NextResponse.json({ error: "That document could not be found." }, { status: 404 });
    throw error;
  }
  if (!opened.blob) return NextResponse.json({ error: "No file is stored for this document." }, { status: 404 });

  const filename = opened.meta.filename ?? safeFilename(opened.meta.title, ALLOWED_MIME[opened.blob.mime]?.ext ?? "bin");
  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  const headers = new Headers({
    "Content-Type": opened.blob.mime,
    "Content-Length": String(opened.blob.size),
    "Content-Disposition": `${disposition}; filename="${asciiName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (opened.blob.sha256) headers.set("ETag", `"${opened.blob.sha256}"`);
  return new Response(toArrayBuffer(opened.blob.bytes), { status: 200, headers });
}

/** The plain `filename=` parameter must be ASCII and quote-free; the RFC 5987 one carries the real name. */
function asciiName(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[—–]/g, "-")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/["\\]/g, "")
      .trim() || "document"
  );
}

/** A `Response` body wants a plain ArrayBuffer; a view over a shared or offset buffer is copied out. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
