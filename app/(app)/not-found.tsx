import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/**
 * Renders inside the app shell (side rail, top bar stay) whenever a route segment under
 * `(app)` calls `notFound()` — e.g. a meeting, organization, staff or country id that doesn't
 * exist — or the user follows a dead link within the app. A genuinely unmatched URL outside
 * this group falls through to the root `app/not-found.tsx` instead.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="eyebrow">Not found</p>
      <EmptyState
        as="h1"
        icon={Compass}
        className="mt-4"
        title="Nothing lives at this address"
        description="This record or page doesn't exist — it may have been moved, closed out, or the link is out of date."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/" className={buttonVariants({ variant: "default" })}>
              Back to the dashboard
            </Link>
            <Link href="/meetings" className={buttonVariants({ variant: "outline" })}>
              Go to Meetings
            </Link>
          </div>
        }
      />
    </div>
  );
}
