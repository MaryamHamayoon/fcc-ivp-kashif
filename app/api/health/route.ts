import { count } from "drizzle-orm";
import { NextResponse } from "next/server";
import { currentDriver, getDb, isEphemeralDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";

export const dynamic = "force-dynamic";
/** An in-memory database is seeded when the server starts; give that boot room beyond a host's default timeout. */
export const maxDuration = 60;


/** Unauthenticated liveness probe: driver, whether data is ephemeral, whether the seed ran. */
export async function GET() {
  try {
    const db = await getDb();
    const [users] = await db.select({ n: count() }).from(s.users);
    const [meetings] = await db.select({ n: count() }).from(s.meetings);
    return NextResponse.json({
      ok: true,
      driver: currentDriver(),
      ephemeral: isEphemeralDb(),
      seeded: (users?.n ?? 0) > 0,
      meetings: meetings?.n ?? 0,
      time: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
