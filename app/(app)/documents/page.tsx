import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LibraryWorkspace } from "@/components/documents/LibraryWorkspace";
import { toLibraryOptions } from "@/components/documents/options";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser, toPolicyUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db/client";
import type { PolicyUser } from "@/lib/domain/policy";
import { PolicyError } from "@/lib/services/errors";
import { type LibraryFilterOptions, libraryOptions } from "@/lib/services/library";

export const metadata: Metadata = { title: "Documents" };
export const dynamic = "force-dynamic";

/** The facets for this user's shelf, or nothing when the policy keeps them out of the room. */
async function loadOptions(user: PolicyUser): Promise<LibraryFilterOptions | null> {
  try {
    return await libraryOptions(await getDb(), user);
  } catch (error) {
    if (error instanceof PolicyError) return null;
    throw error;
  }
}

function WorkspaceFallback() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading documents…</span>
      <Skeleton className="h-16 w-96" />
      <Skeleton className="h-8 w-full max-w-3xl rounded-full" />
      <Skeleton className="h-[32rem] rounded-2xl" />
    </div>
  );
}

export default async function DocumentsPage() {
  const user = await requireUser("/documents");
  const policyUser = toPolicyUser(user);
  const options = await loadOptions(policyUser);
  if (!options) redirect("/forbidden");

  return (
    <Suspense fallback={<WorkspaceFallback />}>
      <LibraryWorkspace options={toLibraryOptions(options)} user={policyUser} />
    </Suspense>
  );
}
