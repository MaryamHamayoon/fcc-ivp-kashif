import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActivityWorkspace } from "@/components/activity/ActivityWorkspace";
import { toActivityOptions } from "@/components/activity/options";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import type { PolicyUser } from "@/lib/domain/policy";
import { type ActivityFilterOptions, activityOptions } from "@/lib/services/activity-feed";
import { PolicyError } from "@/lib/services/errors";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

/** The facets for the logs this user can read, or nothing when the policy keeps them out of the room. */
async function loadOptions(user: PolicyUser): Promise<ActivityFilterOptions | null> {
  try {
    return await activityOptions(await getDb(), user);
  } catch (error) {
    if (error instanceof PolicyError) return null;
    throw error;
  }
}

function WorkspaceFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading activity…</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-[5.25rem] w-full rounded-xl" />
      <Skeleton className="h-[32rem] rounded-xl" />
    </div>
  );
}

export default async function ActivityPage() {
  const user = await requireUser("/activity");
  const now = new Date();
  const options = await loadOptions(toPolicyUser(user));
  if (!options) redirect("/forbidden");

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <ActivityWorkspace options={toActivityOptions(options)} nowMs={now.getTime()} />
    </Suspense>
  );
}
