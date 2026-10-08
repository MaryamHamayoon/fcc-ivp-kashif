import "server-only";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import { isAppError } from "@/lib/services/errors";
import { getMeetingRecord, type MeetingRecord } from "@/lib/services/record";

/**
 * The record every page under `/meetings/[id]` reads. The layout and the tab page render in
 * parallel and both call this; `getMeetingRecord` is memoized per request, so it is one query.
 *
 * Returns `null` rather than throwing so the caller can `notFound()` outside a try/catch —
 * a meeting the reader may not see is reported as missing, never as forbidden.
 */
export async function loadMeetingRecord(idOrCode: string): Promise<MeetingRecord | null> {
  const user = await requireUser(`/meetings/${idOrCode}`);
  try {
    return await getMeetingRecord(await getDb(), idOrCode, toPolicyUser(user));
  } catch (error) {
    if (isAppError(error) && error.status === 404) return null;
    throw error;
  }
}
